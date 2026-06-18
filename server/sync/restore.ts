/**
 * Restore Engine — Supabase Cloud → Local SQLite
 * Full table-by-table restore for disaster recovery.
 */

import db from '../database';
import { getSupabaseClient } from './supabase-client';

interface RestoreResult {
  success: boolean;
  tables: {
    client_trips: number;
    material_resales: number;
    expenses: number;
  };
  totalRecords: number;
  error?: string;
}

/**
 * Full restore: Pull all data from Supabase and replace local database content.
 * Runs inside a transaction for atomicity.
 */
export async function restoreFromSupabase(): Promise<RestoreResult> {
  const client = getSupabaseClient();
  
  if (!client) {
    return {
      success: false,
      tables: { client_trips: 0, material_resales: 0, expenses: 0 },
      totalRecords: 0,
      error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
    };
  }

  try {
    // Fetch all data from Supabase
    const [tripsResult, resalesResult, expensesResult] = await Promise.all([
      client.from('client_trips').select('*'),
      client.from('material_resales').select('*'),
      client.from('expenses').select('*'),
    ]);

    if (tripsResult.error) throw new Error(`Trips fetch failed: ${tripsResult.error.message}`);
    if (resalesResult.error) throw new Error(`Resales fetch failed: ${resalesResult.error.message}`);
    if (expensesResult.error) throw new Error(`Expenses fetch failed: ${expensesResult.error.message}`);

    const trips = tripsResult.data || [];
    const resales = resalesResult.data || [];
    const expenses = expensesResult.data || [];

    // Run restore inside a transaction
    const restoreTransaction = db.transaction(() => {
      // Clear local tables
      db.prepare('DELETE FROM client_trips').run();
      db.prepare('DELETE FROM material_resales').run();
      db.prepare('DELETE FROM expenses').run();
      db.prepare('DELETE FROM sync_queue').run();

      // Insert trips
      const insertTrip = db.prepare(`
        INSERT INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, truck_cost, driver_cut, company_profit, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const t of trips) {
        insertTrip.run(
          t.id, t.date, t.client_name, t.origin_factory, t.destination,
          t.material_type, t.total_tonnage, t.truck_cost, t.driver_cut,
          t.company_profit, t.created_at || new Date().toISOString(),
          t.updated_at || new Date().toISOString()
        );
      }

      // Insert resales
      const insertResale = db.prepare(`
        INSERT INTO material_resales (id, date, end_client, factory_purchase_price, total_tonnage, client_selling_price, truck_cost, driver_cost, explicit_profit, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const r of resales) {
        insertResale.run(
          r.id, r.date, r.end_client, r.factory_purchase_price, r.total_tonnage,
          r.client_selling_price, r.truck_cost, r.driver_cost, r.explicit_profit,
          r.created_at || new Date().toISOString(),
          r.updated_at || new Date().toISOString()
        );
      }

      // Insert expenses
      const insertExpense = db.prepare(`
        INSERT INTO expenses (id, date, category, truck_plate, amount, status, created_at, updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const e of expenses) {
        insertExpense.run(
          e.id, e.date, e.category, e.truck_plate, e.amount, e.status,
          e.created_at || new Date().toISOString(),
          e.updated_at || new Date().toISOString()
        );
      }
    });

    restoreTransaction();

    const result: RestoreResult = {
      success: true,
      tables: {
        client_trips: trips.length,
        material_resales: resales.length,
        expenses: expenses.length,
      },
      totalRecords: trips.length + resales.length + expenses.length,
    };

    console.log(`[RESTORE] ✅ Restored ${result.totalRecords} total records from Supabase`);
    return result;

  } catch (error: any) {
    console.error('[RESTORE] ❌ Restore failed:', error.message);
    return {
      success: false,
      tables: { client_trips: 0, material_resales: 0, expenses: 0 },
      totalRecords: 0,
      error: error.message,
    };
  }
}
