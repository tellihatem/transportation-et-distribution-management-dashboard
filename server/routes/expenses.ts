/**
 * Other Expenses — CRUD API Routes
 * Handles all /api/expenses/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { queueSync } from '../sync/replicator';

const router = Router();

/**
 * GET /api/expenses — List all expenses with optional filters
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (
      id LIKE ? OR
      category LIKE ? OR
      truck_plate LIKE ?
    )`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
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
  const expenses = rows.map(mapRowToExpense);

  res.json({ success: true, data: expenses });
}));

/**
 * GET /api/expenses/stats — Computed stats for filtered expenses
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const { search, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    sql += ` AND (id LIKE ? OR category LIKE ? OR truck_plate LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  if (dateStart) { sql += ' AND date >= ?'; params.push(dateStart); }
  if (dateEnd) { sql += ' AND date <= ?'; params.push(dateEnd); }

  const rows = db.prepare(sql).all(...params) as any[];

  let totalOverhead = 0;
  let pendingAmount = 0;
  const categoryBreakdown: Record<string, number> = {};

  // Pending expenses are not approved yet, so they are reported separately and
  // excluded from totalOverhead / categoryBreakdown (which feed profit figures).
  rows.forEach((row: any) => {
    if (row.status === 'Pending') {
      pendingAmount += row.amount;
      return;
    }
    totalOverhead += row.amount;
    categoryBreakdown[row.category] = (categoryBreakdown[row.category] || 0) + row.amount;
  });

  res.json({ success: true, data: { totalOverhead, categoryBreakdown, pendingAmount } });
}));

/**
 * GET /api/expenses/next-id — Next sequential expense ID (EXP-1, EXP-2, ...)
 */
router.get('/next-id', asyncHandler(async (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id FROM expenses').all() as { id: string }[];
  const max = rows.reduce((m, r) => {
    const match = r.id.match(/(\d+)\s*$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  res.json({ success: true, data: { nextId: `EXP-${max + 1}` } });
}));

/**
 * GET /api/expenses/:id — Single expense
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) throw createApiError('Expense not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: mapRowToExpense(row) });
}));

/**
 * POST /api/expenses — Create new expense
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id, date, category, truckPlate, amount, status } = req.body;

  if (!id || !date || !category) {
    throw createApiError('Missing required fields: id, date, category', 400, 'VALIDATION_ERROR');
  }

  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
  if (existing) {
    throw createApiError('Expense ID already exists', 409, 'DUPLICATE_ID');
  }

  db.prepare(`
    INSERT INTO expenses (id, date, category, truck_plate, amount, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, date, category, truckPlate || '', amount || 0, status || 'Paid');

  const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  queueSync('expenses', id, 'upsert', created);

  res.status(201).json({ success: true, data: mapRowToExpense(created) });
}));

/**
 * PUT /api/expenses/:id — Update existing expense
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Expense not found', 404, 'NOT_FOUND');

  const { date, category, truckPlate, amount, status } = req.body;

  db.prepare(`
    UPDATE expenses SET
      date = ?, category = ?, truck_plate = ?, amount = ?,
      status = ?, updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, category, truckPlate, amount, status, req.params.id);

  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  queueSync('expenses', req.params.id, 'upsert', updated);

  res.json({ success: true, data: mapRowToExpense(updated) });
}));

/**
 * DELETE /api/expenses/:id — Delete expense
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) throw createApiError('Expense not found', 404, 'NOT_FOUND');

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  queueSync('expenses', req.params.id, 'delete', null);

  res.json({ success: true, message: 'Expense deleted' });
}));

/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToExpense(row: any) {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    truckPlate: row.truck_plate,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
  };
}

export default router;
