/**
 * Replicator — Local SQLite → Supabase Cloud Sync
 * 
 * Architecture:
 * 1. After every local DB write, queue an async sync operation
 * 2. Attempt immediate sync; on failure, queue in sync_queue table
 * 3. Background scheduler processes failed items every 5 minutes
 */

import db from '../database';
import { getSupabaseClient } from './supabase-client';

// Column mapping: SQLite table → Supabase table column names
const TABLE_COLUMN_MAP: Record<string, Record<string, string>> = {
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
export function queueSync(
  tableName: string,
  recordId: string,
  operation: 'upsert' | 'delete',
  payload: any
): void {
  // Fire-and-forget async sync
  syncToSupabase(tableName, recordId, operation, payload).catch(() => {
    // On failure, add to persistent sync queue
    addToSyncQueue(tableName, recordId, operation, payload);
  });
}

/**
 * Attempt direct sync to Supabase
 */
async function syncToSupabase(
  tableName: string,
  recordId: string,
  operation: 'upsert' | 'delete',
  payload: any
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return; // No Supabase configured, silently skip

  if (operation === 'delete') {
    const { error } = await client.from(tableName).delete().eq('id', recordId);
    if (error) throw error;
  } else {
    // Filter to only known columns for the target table
    const columnMap = TABLE_COLUMN_MAP[tableName];
    if (!columnMap || !payload) return;

    const mapped: Record<string, any> = {};
    for (const [sqliteCol, supaCol] of Object.entries(columnMap)) {
      if (payload[sqliteCol] !== undefined) {
        mapped[supaCol] = payload[sqliteCol];
      }
    }

    const { error } = await client.from(tableName).upsert(mapped, { onConflict: 'id' });
    if (error) throw error;
  }

  // Mark as synced in local DB
  markAsSynced(tableName, recordId);
  console.log(`[SYNC] ✅ ${operation} ${tableName}/${recordId} synced to Supabase`);
}

/**
 * Mark a record as synced in the local database
 */
function markAsSynced(tableName: string, recordId: string): void {
  try {
    db.prepare(`UPDATE ${tableName} SET synced_at = datetime('now') WHERE id = ?`).run(recordId);
  } catch (e) {
    // Record may have been deleted, ignore
  }
}

/**
 * Add a failed sync operation to the persistent queue
 */
function addToSyncQueue(
  tableName: string,
  recordId: string,
  operation: 'upsert' | 'delete',
  payload: any
): void {
  try {
    // Remove any existing queue entry for the same record (latest wins)
    db.prepare('DELETE FROM sync_queue WHERE table_name = ? AND record_id = ?').run(tableName, recordId);

    db.prepare(`
      INSERT INTO sync_queue (table_name, record_id, operation, payload)
      VALUES (?, ?, ?, ?)
    `).run(tableName, recordId, operation, payload ? JSON.stringify(payload) : null);

    console.log(`[SYNC] ⏳ Queued ${operation} for ${tableName}/${recordId} (will retry)`);
  } catch (e) {
    console.error('[SYNC] Failed to add to sync queue:', e);
  }
}

/**
 * Process all pending items in the sync queue (called by scheduler)
 */
export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  const client = getSupabaseClient();
  if (!client) return { processed: 0, failed: 0 };

  const pending = db.prepare(
    'SELECT * FROM sync_queue WHERE retry_count < 10 ORDER BY created_at ASC LIMIT 50'
  ).all() as any[];

  if (pending.length === 0) return { processed: 0, failed: 0 };

  console.log(`[SYNC] Processing ${pending.length} queued items...`);

  let processed = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const payload = item.payload ? JSON.parse(item.payload) : null;
      await syncToSupabase(item.table_name, item.record_id, item.operation, payload);
      
      // Success — remove from queue
      db.prepare('DELETE FROM sync_queue WHERE queue_id = ?').run(item.queue_id);
      processed++;
    } catch (error: any) {
      // Failure — increment retry counter
      db.prepare(
        'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE queue_id = ?'
      ).run(error?.message || 'Unknown error', item.queue_id);
      failed++;
    }
  }

  console.log(`[SYNC] Queue processing complete: ${processed} synced, ${failed} failed`);
  return { processed, failed };
}

/**
 * Full push sync: sync ALL unsynced records to Supabase
 */
export async function fullPushSync(): Promise<{ total: number; synced: number; failed: number }> {
  const client = getSupabaseClient();
  if (!client) return { total: 0, synced: 0, failed: 0 };

  const tables = ['client_trips', 'material_resales', 'expenses'];
  let total = 0;
  let synced = 0;
  let failed = 0;

  for (const table of tables) {
    const unsyncedRows = db.prepare(`SELECT * FROM ${table} WHERE synced_at IS NULL`).all() as any[];
    total += unsyncedRows.length;

    for (const row of unsyncedRows) {
      try {
        await syncToSupabase(table, row.id, 'upsert', row);
        synced++;
      } catch {
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
export function getSyncStatus() {
  const queueCount = (db.prepare('SELECT COUNT(*) as count FROM sync_queue').get() as any).count;
  
  const unsyncedTrips = (db.prepare('SELECT COUNT(*) as count FROM client_trips WHERE synced_at IS NULL').get() as any).count;
  const unsyncedResales = (db.prepare('SELECT COUNT(*) as count FROM material_resales WHERE synced_at IS NULL').get() as any).count;
  const unsyncedExpenses = (db.prepare('SELECT COUNT(*) as count FROM expenses WHERE synced_at IS NULL').get() as any).count;

  const totalUnsynced = unsyncedTrips + unsyncedResales + unsyncedExpenses;
  const supabaseConfigured = !!getSupabaseClient();

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
