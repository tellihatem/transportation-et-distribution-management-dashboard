/**
 * Client Transport Trips — CRUD API Routes
 * Handles all /api/trips/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { queueSync } from '../sync/replicator';

const router = Router();

/**
 * GET /api/trips — List all trips with optional search/date filters
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM client_trips WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (
      id LIKE ? OR
      client_name LIKE ? OR
      origin_factory LIKE ? OR
      destination LIKE ? OR
      material_type LIKE ? OR
      driver_name LIKE ?
    )`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term);
  }

  if (dateStart && typeof dateStart === 'string') {
    sql += ' AND date >= ?';
    params.push(dateStart);
  }

  if (dateEnd && typeof dateEnd === 'string') {
    sql += ' AND date <= ?';
    params.push(dateEnd);
  }

  sql += ' ORDER BY date DESC';

  const rows = db.prepare(sql).all(...params);

  // Map snake_case DB columns to camelCase for frontend
  const trips = rows.map(mapRowToTrip);

  res.json({ success: true, data: trips });
}));

/**
 * GET /api/trips/stats — Computed stats for filtered trips
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM client_trips WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (id LIKE ? OR client_name LIKE ? OR origin_factory LIKE ? OR destination LIKE ? OR material_type LIKE ? OR driver_name LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term);
  }
  if (dateStart) { sql += ' AND date >= ?'; params.push(dateStart); }
  if (dateEnd) { sql += ' AND date <= ?'; params.push(dateEnd); }

  const rows = db.prepare(sql).all(...params) as any[];

  let grossRevenue = 0;
  let driverPayout = 0;
  let netMargin = 0;
  let totalTons = 0;

  rows.forEach((row: any) => {
    const tripFee = row.truck_cost + row.driver_cut + row.company_profit;
    grossRevenue += tripFee;
    driverPayout += row.driver_cut;
    netMargin += row.company_profit;
    totalTons += row.total_tonnage;
  });

  res.json({ success: true, data: { grossRevenue, driverPayout, netMargin, totalTons } });
}));

/**
 * GET /api/trips/next-id — Next sequential trip ID (TR-1, TR-2, ...)
 */
router.get('/next-id', asyncHandler(async (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id FROM client_trips').all() as { id: string }[];
  const max = rows.reduce((m, r) => {
    const match = r.id.match(/(\d+)\s*$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  res.json({ success: true, data: { nextId: `TR-${max + 1}` } });
}));

/**
 * GET /api/trips/:id — Single trip
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
  if (!row) throw createApiError('Trip not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: mapRowToTrip(row) });
}));

/**
 * POST /api/trips — Create new trip
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id, date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit, driverName, clientPaid, driverPaid } = req.body;

  if (!id || !date || !clientName) {
    throw createApiError('Missing required fields: id, date, clientName', 400, 'VALIDATION_ERROR');
  }

  // Check for duplicate ID
  const existing = db.prepare('SELECT id FROM client_trips WHERE id = ?').get(id);
  if (existing) {
    throw createApiError('Trip ID already exists', 409, 'DUPLICATE_ID');
  }

  db.prepare(`
    INSERT INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, truck_cost, driver_cut, company_profit, driver_name, client_paid, driver_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, clientName, originFactory || '', destination || '', materialType || '', totalTonnage || 0, truckCost || 0, driverCut || 0, companyProfit || 0, driverName || '', clientPaid || 0, driverPaid || 0);

  const created = db.prepare('SELECT * FROM client_trips WHERE id = ?').get(id);

  // Queue async sync to Supabase
  queueSync('client_trips', id, 'upsert', created);

  res.status(201).json({ success: true, data: mapRowToTrip(created) });
}));

/**
 * PUT /api/trips/:id — Update existing trip
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM client_trips WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Trip not found', 404, 'NOT_FOUND');

  const { date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit, driverName, clientPaid, driverPaid } = req.body;

  db.prepare(`
    UPDATE client_trips SET
      date = ?, client_name = ?, origin_factory = ?, destination = ?,
      material_type = ?, total_tonnage = ?, truck_cost = ?, driver_cut = ?,
      company_profit = ?, driver_name = ?, client_paid = ?, driver_paid = ?,
      updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit, driverName || '', clientPaid || 0, driverPaid || 0, req.params.id);

  const updated = db.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
  queueSync('client_trips', req.params.id, 'upsert', updated);

  res.json({ success: true, data: mapRowToTrip(updated) });
}));

/**
 * DELETE /api/trips/:id — Delete trip
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM client_trips WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Trip not found', 404, 'NOT_FOUND');

  db.prepare('DELETE FROM client_trips WHERE id = ?').run(req.params.id);
  queueSync('client_trips', req.params.id, 'delete', null);

  res.json({ success: true, message: 'Trip deleted' });
}));

/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToTrip(row: any) {
  return {
    id: row.id,
    date: row.date,
    clientName: row.client_name,
    originFactory: row.origin_factory,
    destination: row.destination,
    materialType: row.material_type,
    totalTonnage: row.total_tonnage,
    truckCost: row.truck_cost,
    driverCut: row.driver_cut,
    companyProfit: row.company_profit,
    driverName: row.driver_name ?? '',
    clientPaid: row.client_paid ?? 0,
    driverPaid: row.driver_paid ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
  };
}

export default router;
