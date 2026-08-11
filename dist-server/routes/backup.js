"use strict";
/**
 * Backup Export/Import API Routes — /api/backup/*
 * Lets the operator download a full local backup (JSON) and restore it later,
 * independently of the Supabase cloud sync.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const database_1 = __importDefault(require("../database"));
const error_handler_1 = require("../middleware/error-handler");
const replicator_1 = require("../sync/replicator");
const legacy_purge_1 = require("../legacy-purge");
const router = (0, express_1.Router)();
const BACKUP_VERSION = 2;
// Order matters on import: parents before children, because the allocation
// tables carry FOREIGN KEY references to their payment tables (and foreign_keys
// is ON). Deletion walks this list in reverse for the same reason.
const TABLES = [
    'client_trips',
    'material_resales',
    'expenses',
    'client_payments',
    'client_payment_allocations',
    'driver_payments',
    'driver_payment_allocations',
    'supplier_invoices',
    'supplier_payments',
    'supplier_payment_allocations',
];
const COLUMNS_BY_TABLE = {
    client_trips: ['id', 'date', 'client_name', 'origin_factory', 'destination', 'material_type', 'total_tonnage', 'quantity_unit', 'truck_cost', 'driver_cut', 'company_profit', 'driver_name', 'client_paid', 'driver_paid', 'created_at', 'updated_at'],
    material_resales: ['id', 'date', 'end_client', 'destination', 'material_type', 'origin_factory', 'factory_purchase_price', 'product_unit_price', 'total_tonnage', 'quantity_unit', 'client_selling_price', 'truck_cost', 'driver_cost', 'explicit_profit', 'driver_name', 'trip_count', 'client_paid', 'driver_paid', 'supplier_paid', 'created_at', 'updated_at'],
    expenses: ['id', 'date', 'category', 'truck_plate', 'amount', 'status', 'created_at', 'updated_at'],
    client_payments: ['id', 'date', 'client_name', 'amount', 'payment_method', 'notes', 'created_at', 'updated_at'],
    client_payment_allocations: ['payment_id', 'trip_type', 'trip_id', 'amount', 'created_at'],
    driver_payments: ['id', 'date', 'driver_name', 'amount', 'payment_type', 'notes', 'created_at', 'updated_at'],
    driver_payment_allocations: ['payment_id', 'trip_type', 'trip_id', 'amount', 'created_at'],
    supplier_invoices: ['id', 'date', 'supplier_name', 'amount', 'notes', 'paid', 'created_at', 'updated_at'],
    supplier_payments: ['id', 'date', 'supplier_name', 'amount', 'payment_type', 'notes', 'created_at', 'updated_at'],
    supplier_payment_allocations: ['payment_id', 'target_type', 'target_id', 'amount', 'created_at'],
};
// Defaults for columns that may be absent in backups from older app versions
const COLUMN_FALLBACKS = {
    destination: '',
    driver_name: '',
    material_type: '',
    origin_factory: '',
    quantity_unit: 'طن',
    // Every resale involves at least one trip; older backups predate the column.
    product_unit_price: 0,
    trip_count: 1,
    client_paid: 0,
    driver_paid: 0,
    supplier_paid: 0,
    paid: 0,
};
/**
 * GET /api/backup/export — Downloads a full JSON snapshot of all business tables
 */
router.get('/export', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const tables = {};
    for (const table of TABLES) {
        tables[table] = database_1.default.prepare(`SELECT * FROM ${table}`).all();
    }
    const backup = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tables,
    };
    const filename = `logistics-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
}));
/**
 * POST /api/backup/reset — Deletes every business record, leaving an empty
 * database. Exists so an operator can clear leftover or test data from inside
 * the app, instead of having to find and delete the database file by hand
 * (it lives in the OS user-data folder, which uninstalling does not remove).
 * Schema and migrations are untouched. Requires { confirm: true }.
 */
router.post('/reset', (0, error_handler_1.asyncHandler)(async (req, res) => {
    if (!req.body?.confirm) {
        throw (0, error_handler_1.createApiError)('Reset will permanently DELETE all records. Send { "confirm": true } to proceed.', 400, 'CONFIRMATION_REQUIRED');
    }
    const deleted = {};
    const resetTransaction = database_1.default.transaction(() => {
        // Children before parents: the allocation tables carry FK references.
        for (const table of [...TABLES].reverse()) {
            deleted[table] = database_1.default.prepare(`DELETE FROM ${table}`).run().changes;
        }
        // Pending sync items carry full row payloads. Left in place they would
        // replay the very rows this wipe just removed to Supabase afterwards.
        deleted['sync_queue'] = database_1.default.prepare('DELETE FROM sync_queue').run().changes;
    });
    resetTransaction();
    // Reclaim the freed pages so the file on disk actually shrinks.
    database_1.default.exec('VACUUM');
    const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
    console.log(`[BACKUP] Reset complete — ${total} record(s) deleted.`);
    res.json({ success: true, data: { deleted, total } });
}));
/**
 * POST /api/backup/import — Restores from a previously exported JSON backup.
 * REPLACES all local data for the three business tables. Requires { confirm: true }.
 */
router.post('/import', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { confirm, tables } = req.body;
    if (!confirm) {
        throw (0, error_handler_1.createApiError)('Import will REPLACE all local data with the backup contents. Send { "confirm": true } to proceed.', 400, 'CONFIRMATION_REQUIRED');
    }
    if (!tables || typeof tables !== 'object') {
        throw (0, error_handler_1.createApiError)('Invalid backup file: missing "tables" object', 400, 'VALIDATION_ERROR');
    }
    for (const table of TABLES) {
        if (tables[table] !== undefined && !Array.isArray(tables[table])) {
            throw (0, error_handler_1.createApiError)(`Invalid backup file: "${table}" must be an array`, 400, 'VALIDATION_ERROR');
        }
    }
    // The imported rows are filtered through the legacy seed purge below. If
    // that filter cannot run, a backup made on a polluted machine would land
    // unfiltered — refuse up front rather than import dirty data.
    if (!fs_1.default.existsSync((0, legacy_purge_1.purgeSqlFile)())) {
        throw (0, error_handler_1.createApiError)('Import unavailable: the legacy-data filter is missing from this installation. Reinstall the application.', 500, 'PURGE_FILTER_MISSING');
    }
    const counts = {};
    const importTransaction = database_1.default.transaction(() => {
        // Clear children before parents so FK constraints are never violated.
        for (const table of [...TABLES].reverse()) {
            database_1.default.prepare(`DELETE FROM ${table}`).run();
        }
        // Drop pending sync payloads too — they describe the replaced dataset.
        database_1.default.prepare('DELETE FROM sync_queue').run();
        // Insert parents before children (TABLES is ordered accordingly).
        for (const table of TABLES) {
            const rows = tables[table] || [];
            const cols = COLUMNS_BY_TABLE[table];
            const placeholders = cols.map(() => '?').join(', ');
            const insert = database_1.default.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
            for (const row of rows) {
                // Backups from older app versions may lack columns added later
                // (destination, driver_name, client_paid, driver_paid, quantity_unit).
                // Inserting an explicit NULL bypasses SQLite column defaults and can
                // violate NOT NULL, so coalesce missing values to safe defaults instead.
                insert.run(...cols.map(c => row[c] ?? COLUMN_FALLBACKS[c] ?? null));
            }
            counts[table] = rows.length;
        }
    });
    importTransaction();
    // A backup exported from a machine that still carried the old demo records
    // would smuggle them straight back into a clean database. Run the same
    // purge that executes at every boot (migration 007) over the imported rows,
    // and queue deletes so the Supabase mirror is cleaned too. The purge
    // matches id AND name AND date, so genuine records are untouched, and
    // deleting absent rows is a no-op.
    (0, legacy_purge_1.purgeLegacySeedRows)(database_1.default);
    (0, legacy_purge_1.queueCloudSeedDeletes)();
    // Queue every restored record for Supabase sync (no-op if cloud sync isn't
    // configured). Only the tables that have a Supabase mirror and a text `id`
    // are replicated; the allocation tables use autoincrement ids and are local.
    for (const table of ['client_trips', 'material_resales', 'expenses']) {
        const rows = database_1.default.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
            (0, replicator_1.queueSync)(table, row.id, 'upsert', row);
        }
    }
    res.json({ success: true, data: { imported: counts } });
}));
exports.default = router;
