"use strict";
/**
 * Replicator — Local SQLite → Supabase Cloud Sync
 *
 * Architecture:
 * 1. After every local DB write, queue an async sync operation
 * 2. Attempt immediate sync; on failure, queue in sync_queue table
 * 3. Background scheduler processes failed items every 5 minutes
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueSync = queueSync;
exports.processSyncQueue = processSyncQueue;
exports.fullPushSync = fullPushSync;
exports.getSyncStatus = getSyncStatus;
const database_1 = __importDefault(require("../database"));
const supabase_client_1 = require("./supabase-client");
// Column mapping: SQLite table → Supabase table column names
const TABLE_COLUMN_MAP = {
    client_trips: {
        id: 'id', date: 'date', client_name: 'client_name',
        origin_factory: 'origin_factory', destination: 'destination',
        material_type: 'material_type', total_tonnage: 'total_tonnage',
        quantity_unit: 'quantity_unit',
        truck_cost: 'truck_cost', driver_cut: 'driver_cut',
        company_profit: 'company_profit', driver_name: 'driver_name',
        client_paid: 'client_paid', driver_paid: 'driver_paid',
        created_at: 'created_at', updated_at: 'updated_at',
    },
    material_resales: {
        id: 'id', date: 'date', end_client: 'end_client', destination: 'destination',
        material_type: 'material_type', origin_factory: 'origin_factory',
        factory_purchase_price: 'factory_purchase_price', product_unit_price: 'product_unit_price', total_tonnage: 'total_tonnage',
        quantity_unit: 'quantity_unit',
        client_selling_price: 'client_selling_price', truck_cost: 'truck_cost',
        driver_cost: 'driver_cost', explicit_profit: 'explicit_profit',
        driver_name: 'driver_name', trip_count: 'trip_count',
        client_paid: 'client_paid', driver_paid: 'driver_paid',
        created_at: 'created_at', updated_at: 'updated_at',
    },
    expenses: {
        id: 'id', date: 'date', category: 'category',
        truck_plate: 'truck_plate', amount: 'amount', status: 'status',
        created_at: 'created_at', updated_at: 'updated_at',
    },
};
/**
 * Queue a sync operation. Tries immediate sync; falls back to queue on failure.
 */
function queueSync(tableName, recordId, operation, payload) {
    // Fire-and-forget async sync
    syncToSupabase(tableName, recordId, operation, payload).catch(() => {
        // On failure, add to persistent sync queue
        addToSyncQueue(tableName, recordId, operation, payload);
    });
}
/**
 * Attempt direct sync to Supabase
 */
async function syncToSupabase(tableName, recordId, operation, payload) {
    const client = (0, supabase_client_1.getSupabaseClient)();
    if (!client)
        return; // No Supabase configured, silently skip
    if (operation === 'delete') {
        const { error } = await client.from(tableName).delete().eq('id', recordId);
        if (error)
            throw error;
    }
    else {
        // Filter to only known columns for the target table
        const columnMap = TABLE_COLUMN_MAP[tableName];
        if (!columnMap || !payload)
            return;
        const mapped = {};
        for (const [sqliteCol, supaCol] of Object.entries(columnMap)) {
            if (payload[sqliteCol] !== undefined) {
                mapped[supaCol] = payload[sqliteCol];
            }
        }
        const { error } = await client.from(tableName).upsert(mapped, { onConflict: 'id' });
        if (error)
            throw error;
    }
    // Mark as synced in local DB
    markAsSynced(tableName, recordId);
    console.log(`[SYNC] ✅ ${operation} ${tableName}/${recordId} synced to Supabase`);
}
/**
 * Mark a record as synced in the local database
 */
function markAsSynced(tableName, recordId) {
    try {
        database_1.default.prepare(`UPDATE ${tableName} SET synced_at = datetime('now') WHERE id = ?`).run(recordId);
    }
    catch (e) {
        // Record may have been deleted, ignore
    }
}
/**
 * Add a failed sync operation to the persistent queue
 */
function addToSyncQueue(tableName, recordId, operation, payload) {
    try {
        // Remove any existing queue entry for the same record (latest wins)
        database_1.default.prepare('DELETE FROM sync_queue WHERE table_name = ? AND record_id = ?').run(tableName, recordId);
        database_1.default.prepare(`
      INSERT INTO sync_queue (table_name, record_id, operation, payload)
      VALUES (?, ?, ?, ?)
    `).run(tableName, recordId, operation, payload ? JSON.stringify(payload) : null);
        console.log(`[SYNC] ⏳ Queued ${operation} for ${tableName}/${recordId} (will retry)`);
    }
    catch (e) {
        console.error('[SYNC] Failed to add to sync queue:', e);
    }
}
/**
 * Process all pending items in the sync queue (called by scheduler)
 */
let queueRunInFlight = false;
async function processSyncQueue() {
    const client = (0, supabase_client_1.getSupabaseClient)();
    if (!client)
        return { processed: 0, failed: 0 };
    // setInterval does not wait for an async callback. Against a slow or
    // blackholed endpoint one pass can outlive the interval, and overlapping
    // passes would then hammer the same unclaimed rows. One pass at a time.
    if (queueRunInFlight)
        return { processed: 0, failed: 0 };
    queueRunInFlight = true;
    try {
        // Rows that have exhausted their retries are dead: never sent again, but
        // until now re-scanned by every tick forever. Reap them (a fresh edit of
        // the same record re-queues it with a clean count).
        database_1.default.prepare('DELETE FROM sync_queue WHERE retry_count >= 10').run();
        const pending = database_1.default.prepare('SELECT * FROM sync_queue WHERE retry_count < 10 ORDER BY created_at ASC LIMIT 50').all();
        if (pending.length === 0)
            return { processed: 0, failed: 0 };
        console.log(`[SYNC] Processing ${pending.length} queued items...`);
        let processed = 0;
        let failed = 0;
        for (const item of pending) {
            try {
                const payload = item.payload ? JSON.parse(item.payload) : null;
                await syncToSupabase(item.table_name, item.record_id, item.operation, payload);
                // Success — remove from queue
                database_1.default.prepare('DELETE FROM sync_queue WHERE queue_id = ?').run(item.queue_id);
                processed++;
            }
            catch (error) {
                // Failure — increment retry counter
                database_1.default.prepare('UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE queue_id = ?').run(error?.message || 'Unknown error', item.queue_id);
                failed++;
            }
        }
        console.log(`[SYNC] Queue processing complete: ${processed} synced, ${failed} failed`);
        return { processed, failed };
    }
    finally {
        queueRunInFlight = false;
    }
}
/**
 * Full push sync: sync ALL unsynced records to Supabase
 */
async function fullPushSync() {
    const client = (0, supabase_client_1.getSupabaseClient)();
    if (!client)
        return { total: 0, synced: 0, failed: 0 };
    const tables = ['client_trips', 'material_resales', 'expenses'];
    let total = 0;
    let synced = 0;
    let failed = 0;
    for (const table of tables) {
        const unsyncedRows = database_1.default.prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL`).all();
        total += unsyncedRows.length;
        for (const row of unsyncedRows) {
            try {
                await syncToSupabase(table, row.id, 'upsert', row);
                synced++;
            }
            catch {
                failed++;
            }
        }
    }
    // Also process any queued deletes
    await processSyncQueue();
    console.log(`[SYNC] Full push complete: ${synced}/${total} synced, ${failed} failed`);
    return { total, synced, failed };
}
/**
 * Get sync status summary
 */
function getSyncStatus() {
    const queueCount = database_1.default.prepare('SELECT COUNT(*) as count FROM sync_queue').get().count;
    const unsyncedTrips = database_1.default.prepare('SELECT COUNT(*) as count FROM client_trips WHERE synced_at IS NULL').get().count;
    const unsyncedResales = database_1.default.prepare('SELECT COUNT(*) as count FROM material_resales WHERE synced_at IS NULL').get().count;
    const unsyncedExpenses = database_1.default.prepare('SELECT COUNT(*) as count FROM expenses WHERE synced_at IS NULL').get().count;
    const totalUnsynced = unsyncedTrips + unsyncedResales + unsyncedExpenses;
    const supabaseConfigured = !!(0, supabase_client_1.getSupabaseClient)();
    return {
        supabaseConfigured,
        pendingQueueItems: queueCount,
        unsyncedRecords: totalUnsynced,
        breakdown: {
            trips: unsyncedTrips,
            resales: unsyncedResales,
            expenses: unsyncedExpenses,
        },
    };
}
