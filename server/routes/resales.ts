/**
 * Material Resale Transactions — CRUD API Routes
 * Handles all /api/resales/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { queueSync } from '../sync/replicator';
import { calcResale, calcInvoiceTotal, resaleTripCount } from '../resale-math';

const router = Router();

/**
 * GET /api/resales — List all resale transactions with optional filters
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM material_resales WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (
      id LIKE ? OR
      end_client LIKE ? OR
      destination LIKE ? OR
      driver_name LIKE ? OR
      material_type LIKE ? OR
      origin_factory LIKE ?
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
  const resales = rows.map(mapRowToResale);

  res.json({ success: true, data: resales });
}));

/**
 * GET /api/resales/stats — Computed stats for filtered resales
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM material_resales WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (id LIKE ? OR end_client LIKE ? OR destination LIKE ? OR driver_name LIKE ? OR material_type LIKE ? OR origin_factory LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term);
  }
  if (dateStart) { sql += ' AND date >= ?'; params.push(dateStart); }
  if (dateEnd) { sql += ' AND date <= ?'; params.push(dateEnd); }

  const rows = db.prepare(sql).all(...params) as any[];

  let tradingTurnover = 0;      // total invoiced to clients (goods + transport)
  let capitalOutlay = 0;        // what the goods cost us
  let grossProductProfit = 0;   // goods margin, before any transport
  let transportTotal = 0;       // trips × cost per trip
  let hiddenProfit = 0;
  let totalTrueProfit = 0;      // net real profit
  let totalTons = 0;

  rows.forEach((row: any) => {
    const m = calcResale(mapRowToResale(row));

    tradingTurnover += m.invoiceTotal;
    capitalOutlay += m.totalBuyCost;
    grossProductProfit += m.grossProductProfit;
    transportTotal += m.transportTotal;
    hiddenProfit += m.hiddenProfit;
    totalTrueProfit += m.netRealProfit;
    totalTons += row.total_tonnage;
  });

  res.json({
    success: true,
    data: {
      tradingTurnover, capitalOutlay, grossProductProfit,
      transportTotal, hiddenProfit, totalTrueProfit, totalTons,
    },
  });
}));

/**
 * GET /api/resales/next-id — Next sequential resale ID (RS-1, RS-2, ...)
 */
router.get('/next-id', asyncHandler(async (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id FROM material_resales').all() as { id: string }[];
  const max = rows.reduce((m, r) => {
    const match = r.id.match(/(\d+)\s*$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  res.json({ success: true, data: { nextId: `RS-${max + 1}` } });
}));

/**
 * GET /api/resales/:id — Single resale
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM material_resales WHERE id = ?').get(req.params.id);
  if (!row) throw createApiError('Resale not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: mapRowToResale(row) });
}));

/**
 * POST /api/resales — Create new resale
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id, date, endClient, destination, materialType, originFactory, factoryPurchasePrice, productUnitPrice, totalTonnage, quantityUnit, truckCost, driverCost, explicitProfit, driverName, tripCount } = req.body;

  if (!id || !date || !endClient) {
    throw createApiError('Missing required fields: id, date, endClient', 400, 'VALIDATION_ERROR');
  }

  const existing = db.prepare('SELECT id FROM material_resales WHERE id = ?').get(id);
  if (existing) {
    throw createApiError('Resale ID already exists', 409, 'DUPLICATE_ID');
  }

  // The invoice total is never accepted from the client: it is derived from
  // the goods and transport figures, so the two invoice lines always add up
  // to the amount the ledgers settle against.
  const trips = resaleTripCount({ tripCount });
  const invoiceTotal = calcInvoiceTotal({
    factoryPurchasePrice: factoryPurchasePrice || 0,
    productUnitPrice: productUnitPrice || 0,
    totalTonnage: totalTonnage || 0,
    truckCost: truckCost || 0,
    driverCost: driverCost || 0,
    explicitProfit: explicitProfit || 0,
    tripCount: trips,
  });

  db.prepare(`
    INSERT INTO material_resales (id, date, end_client, destination, material_type, origin_factory, factory_purchase_price, product_unit_price, total_tonnage, quantity_unit, client_selling_price, truck_cost, driver_cost, explicit_profit, driver_name, trip_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, endClient, destination || '', materialType || '', originFactory || '', factoryPurchasePrice || 0, productUnitPrice || 0, totalTonnage || 0, quantityUnit || 'طن', invoiceTotal, truckCost || 0, driverCost || 0, explicitProfit || 0, driverName || '', trips);

  const created = db.prepare('SELECT * FROM material_resales WHERE id = ?').get(id);
  queueSync('material_resales', id, 'upsert', created);

  res.status(201).json({ success: true, data: mapRowToResale(created) });
}));

/**
 * PUT /api/resales/:id — Update existing resale
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM material_resales WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Resale not found', 404, 'NOT_FOUND');

  const { date, endClient, destination, materialType, originFactory, factoryPurchasePrice, productUnitPrice, totalTonnage, quantityUnit, truckCost, driverCost, explicitProfit, driverName, tripCount } = req.body;

  const trips = resaleTripCount({ tripCount });
  const invoiceTotal = calcInvoiceTotal({
    factoryPurchasePrice, productUnitPrice: productUnitPrice || 0,
    totalTonnage, truckCost, driverCost, explicitProfit, tripCount: trips,
  });

  db.prepare(`
    UPDATE material_resales SET
      date = ?, end_client = ?, destination = ?, material_type = ?, origin_factory = ?, factory_purchase_price = ?, product_unit_price = ?, total_tonnage = ?, quantity_unit = ?,
      client_selling_price = ?, truck_cost = ?, driver_cost = ?,
      explicit_profit = ?, driver_name = ?, trip_count = ?,
      updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, endClient, destination || '', materialType || '', originFactory || '', factoryPurchasePrice, productUnitPrice || 0, totalTonnage, quantityUnit || 'طن', invoiceTotal, truckCost, driverCost, explicitProfit, driverName || '', trips, req.params.id);

  const updated = db.prepare('SELECT * FROM material_resales WHERE id = ?').get(req.params.id);
  queueSync('material_resales', req.params.id, 'upsert', updated);

  res.json({ success: true, data: mapRowToResale(updated) });
}));

/**
 * DELETE /api/resales/:id — Delete resale
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM material_resales WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Resale not found', 404, 'NOT_FOUND');

  db.prepare('DELETE FROM material_resales WHERE id = ?').run(req.params.id);
  queueSync('material_resales', req.params.id, 'delete', null);

  res.json({ success: true, message: 'Resale deleted' });
}));

/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToResale(row: any) {
  return {
    id: row.id,
    date: row.date,
    endClient: row.end_client,
    destination: row.destination,
    materialType: row.material_type ?? '',
    originFactory: row.origin_factory ?? '',
    factoryPurchasePrice: row.factory_purchase_price,
    productUnitPrice: row.product_unit_price ?? 0,
    totalTonnage: row.total_tonnage,
    quantityUnit: row.quantity_unit ?? 'طن',
    clientSellingPrice: row.client_selling_price,
    truckCost: row.truck_cost,
    driverCost: row.driver_cost,
    explicitProfit: row.explicit_profit,
    driverName: row.driver_name ?? '',
    tripCount: Math.max(1, row.trip_count ?? 1),
    clientPaid: row.client_paid ?? 0,
    driverPaid: row.driver_paid ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
  };
}

export default router;
