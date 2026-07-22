/**
 * Backup Export/Import API Routes — /api/backup/*
 * Lets the operator download a full local backup (JSON) and restore it later,
 * independently of the Supabase cloud sync.
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { queueSync } from '../sync/replicator';

const router = Router();

const BACKUP_VERSION = 1;
const TABLES = ['client_trips', 'material_resales', 'expenses'] as const;
type TableName = typeof TABLES[number];

const COLUMNS_BY_TABLE: Record<TableName, string[]> = {
  client_trips: ['id', 'date', 'client_name', 'origin_factory', 'destination', 'material_type', 'total_tonnage', 'truck_cost', 'driver_cut', 'company_profit', 'created_at', 'updated_at'],
  material_resales: ['id', 'date', 'end_client', 'factory_purchase_price', 'total_tonnage', 'client_selling_price', 'truck_cost', 'driver_cost', 'explicit_profit', 'created_at', 'updated_at'],
  expenses: ['id', 'date', 'category', 'truck_plate', 'amount', 'status', 'created_at', 'updated_at'],
};

/**
 * GET /api/backup/export — Downloads a full JSON snapshot of all business tables
 */
router.get('/export', asyncHandler(async (_req: Request, res: Response) => {
  const tables: Record<string, any[]> = {};
  for (const table of TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
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
 * POST /api/backup/import — Restores from a previously exported JSON backup.
 * REPLACES all local data for the three business tables. Requires { confirm: true }.
 */
router.post('/import', asyncHandler(async (req: Request, res: Response) => {
  const { confirm, tables } = req.body;

  if (!confirm) {
    throw createApiError(
      'Import will REPLACE all local data with the backup contents. Send { "confirm": true } to proceed.',
      400,
      'CONFIRMATION_REQUIRED'
    );
  }

  if (!tables || typeof tables !== 'object') {
    throw createApiError('Invalid backup file: missing "tables" object', 400, 'VALIDATION_ERROR');
  }

  for (const table of TABLES) {
    if (tables[table] !== undefined && !Array.isArray(tables[table])) {
      throw createApiError(`Invalid backup file: "${table}" must be an array`, 400, 'VALIDATION_ERROR');
    }
  }

  const counts: Record<string, number> = {};

  const importTransaction = db.transaction(() => {
    for (const table of TABLES) {
      const rows: any[] = tables[table] || [];
      const cols = COLUMNS_BY_TABLE[table];
      const placeholders = cols.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);

      db.prepare(`DELETE FROM ${table}`).run();
      for (const row of rows) {
        insert.run(...cols.map(c => row[c] ?? null));
      }
      counts[table] = rows.length;
    }
  });

  importTransaction();

  // Queue every restored record for Supabase sync (no-op if cloud sync isn't configured)
  for (const table of TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
    for (const row of rows) {
      queueSync(table, row.id, 'upsert', row);
    }
  }

  res.json({ success: true, data: { imported: counts } });
}));

export default router;
