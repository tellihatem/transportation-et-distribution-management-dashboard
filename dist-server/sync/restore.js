"use strict";
/**
 * Restore Engine — Supabase Cloud → Local SQLite
 * Full table-by-table restore for disaster recovery.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreFromSupabase = restoreFromSupabase;
const database_1 = __importDefault(require("../database"));
const supabase_client_1 = require("./supabase-client");
const legacy_purge_1 = require("../legacy-purge");
/**
 * Full restore: Pull all data from Supabase and replace local database content.
 * Runs inside a transaction for atomicity.
 */
async function restoreFromSupabase() {
    const client = (0, supabase_client_1.getSupabaseClient)();
    if (!client) {
        return {
            success: false,
            tables: { client_trips: 0, material_resales: 0, expenses: 0 },
            totalRecords: 0,
            error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
        };
    }
    // The Supabase mirror only holds client_trips / material_resales / expenses.
    // It does NOT hold the payment ledgers (client_payments, driver_payments and
    // their allocation tables), and this restore replaces trips wholesale — which
    // would leave allocations pointing at trips that no longer exist and every
    // client_paid / driver_paid cache disagreeing with the ledger.
    // Refuse rather than silently corrupt; the local JSON backup
    // (GET /api/backup/export) covers all tables and is the supported path.
    const ledgerRows = database_1.default.prepare(`
    SELECT
      (SELECT COUNT(*) FROM client_payments) +
      (SELECT COUNT(*) FROM driver_payments) +
      (SELECT COUNT(*) FROM supplier_payments) +
      (SELECT COUNT(*) FROM supplier_invoices) AS total
  `).get().total;
    if (ledgerRows > 0) {
        return {
            success: false,
            tables: { client_trips: 0, material_resales: 0, expenses: 0 },
            totalRecords: 0,
            error: 'Cloud restore is not supported once client/driver payment ledgers contain data, ' +
                'because Supabase does not mirror the ledger tables and restoring would desynchronise ' +
                'recorded payments. Use the local JSON backup (/api/backup/export and /api/backup/import) instead.',
        };
    }
    try {
        // Fetch all data from Supabase
        const [tripsResult, resalesResult, expensesResult] = await Promise.all([
            client.from('client_trips').select('*'),
            client.from('material_resales').select('*'),
            client.from('expenses').select('*'),
        ]);
        if (tripsResult.error)
            throw new Error(`Trips fetch failed: ${tripsResult.error.message}`);
        if (resalesResult.error)
            throw new Error(`Resales fetch failed: ${resalesResult.error.message}`);
        if (expensesResult.error)
            throw new Error(`Expenses fetch failed: ${expensesResult.error.message}`);
        const trips = tripsResult.data || [];
        const resales = resalesResult.data || [];
        const expenses = expensesResult.data || [];
        // Run restore inside a transaction
        const restoreTransaction = database_1.default.transaction(() => {
            // Clear local tables
            database_1.default.prepare('DELETE FROM client_trips').run();
            database_1.default.prepare('DELETE FROM material_resales').run();
            database_1.default.prepare('DELETE FROM expenses').run();
            database_1.default.prepare('DELETE FROM sync_queue').run();
            // Insert trips
            const insertTrip = database_1.default.prepare(`
        INSERT INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, quantity_unit, truck_cost, driver_cut, company_profit, driver_name, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
            for (const t of trips) {
                insertTrip.run(t.id, t.date, t.client_name, t.origin_factory, t.destination, t.material_type, t.total_tonnage, t.quantity_unit ?? 'طن', t.truck_cost, t.driver_cut, t.company_profit, t.driver_name ?? '', t.created_at || new Date().toISOString(), t.updated_at || new Date().toISOString());
            }
            // Insert resales
            // Every money-bearing column must survive a restore. product_unit_price
            // and trip_count were once dropped here, which zeroed the sell revenue
            // and collapsed multi-trip deliveries to one trip's transport and wage.
            const insertResale = database_1.default.prepare(`
        INSERT INTO material_resales (id, date, end_client, destination, material_type, origin_factory, factory_purchase_price, product_unit_price, total_tonnage, quantity_unit, client_selling_price, truck_cost, driver_cost, explicit_profit, driver_name, trip_count, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
            for (const r of resales) {
                insertResale.run(r.id, r.date, r.end_client, r.destination ?? '', r.material_type ?? '', r.origin_factory ?? '', r.factory_purchase_price, r.product_unit_price ?? 0, r.total_tonnage, r.quantity_unit ?? 'طن', r.client_selling_price, r.truck_cost, r.driver_cost, r.explicit_profit, r.driver_name ?? '', Math.max(1, r.trip_count ?? 1), r.created_at || new Date().toISOString(), r.updated_at || new Date().toISOString());
            }
            // Insert expenses
            const insertExpense = database_1.default.prepare(`
        INSERT INTO expenses (id, date, category, truck_plate, amount, status, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
            for (const e of expenses) {
                insertExpense.run(e.id, e.date, e.category, e.truck_plate, e.amount, e.status, e.created_at || new Date().toISOString(), e.updated_at || new Date().toISOString());
            }
        });
        restoreTransaction();
        // Seed-era builds pushed their demo rows to Supabase, and nothing on the
        // mirror was ever cleaned — so a cloud restore is a reinfection path
        // unless the same purge that runs at boot runs here too. Queue mirror
        // deletes as well, so the source itself stops carrying the rows.
        (0, legacy_purge_1.purgeLegacySeedRows)(database_1.default);
        (0, legacy_purge_1.queueCloudSeedDeletes)();
        // Report what actually remains after the purge, not what was fetched —
        // the two differ exactly when the mirror was polluted.
        const kept = {
            client_trips: database_1.default.prepare('SELECT COUNT(*) c FROM client_trips').get().c,
            material_resales: database_1.default.prepare('SELECT COUNT(*) c FROM material_resales').get().c,
            expenses: database_1.default.prepare('SELECT COUNT(*) c FROM expenses').get().c,
        };
        const fetched = trips.length + resales.length + expenses.length;
        const purged = fetched - (kept.client_trips + kept.material_resales + kept.expenses);
        const result = {
            success: true,
            tables: kept,
            totalRecords: kept.client_trips + kept.material_resales + kept.expenses,
        };
        console.log(`[RESTORE] ✅ Restored ${result.totalRecords} record(s) from Supabase` +
            (purged > 0 ? ` (${purged} legacy seed row(s) filtered out and queued for cloud deletion)` : ''));
        return result;
    }
    catch (error) {
        console.error('[RESTORE] ❌ Restore failed:', error.message);
        return {
            success: false,
            tables: { client_trips: 0, material_resales: 0, expenses: 0 },
            totalRecords: 0,
            error: error.message,
        };
    }
}
