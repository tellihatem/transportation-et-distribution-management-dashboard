"use strict";
/**
 * Other Expenses — CRUD API Routes
 * Handles all /api/expenses/* endpoints
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../database"));
const error_handler_1 = require("../middleware/error-handler");
const replicator_1 = require("../sync/replicator");
const router = (0, express_1.Router)();
/**
 * GET /api/expenses — List all expenses with optional filters
 */
router.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];
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
    const rows = database_1.default.prepare(sql).all(...params);
    const expenses = rows.map(mapRowToExpense);
    res.json({ success: true, data: expenses });
}));
/**
 * GET /api/expenses/stats — Computed stats for filtered expenses
 */
router.get('/stats', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];
    if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (id LIKE ? OR category LIKE ? OR truck_plate LIKE ?)`;
        const term = `%${search.trim()}%`;
        params.push(term, term, term);
    }
    if (dateStart) {
        sql += ' AND date >= ?';
        params.push(dateStart);
    }
    if (dateEnd) {
        sql += ' AND date <= ?';
        params.push(dateEnd);
    }
    const rows = database_1.default.prepare(sql).all(...params);
    let totalOverhead = 0;
    let pendingAmount = 0;
    const categoryBreakdown = {};
    rows.forEach((row) => {
        totalOverhead += row.amount;
        categoryBreakdown[row.category] = (categoryBreakdown[row.category] || 0) + row.amount;
        if (row.status === 'Pending') {
            pendingAmount += row.amount;
        }
    });
    res.json({ success: true, data: { totalOverhead, categoryBreakdown, pendingAmount } });
}));
/**
 * GET /api/expenses/:id — Single expense
 */
router.get('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const row = database_1.default.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!row)
        throw (0, error_handler_1.createApiError)('Expense not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: mapRowToExpense(row) });
}));
/**
 * POST /api/expenses — Create new expense
 */
router.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id, date, category, truckPlate, amount, status } = req.body;
    if (!id || !date || !category) {
        throw (0, error_handler_1.createApiError)('Missing required fields: id, date, category', 400, 'VALIDATION_ERROR');
    }
    const existing = database_1.default.prepare('SELECT id FROM expenses WHERE id = ?').get(id);
    if (existing) {
        throw (0, error_handler_1.createApiError)('Expense ID already exists', 409, 'DUPLICATE_ID');
    }
    database_1.default.prepare(`
    INSERT INTO expenses (id, date, category, truck_plate, amount, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, date, category, truckPlate || '', amount || 0, status || 'Paid');
    const created = database_1.default.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    (0, replicator_1.queueSync)('expenses', id, 'upsert', created);
    res.status(201).json({ success: true, data: mapRowToExpense(created) });
}));
/**
 * PUT /api/expenses/:id — Update existing expense
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Expense not found', 404, 'NOT_FOUND');
    const { date, category, truckPlate, amount, status } = req.body;
    database_1.default.prepare(`
    UPDATE expenses SET
      date = ?, category = ?, truck_plate = ?, amount = ?,
      status = ?, updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, category, truckPlate, amount, status, req.params.id);
    const updated = database_1.default.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    (0, replicator_1.queueSync)('expenses', req.params.id, 'upsert', updated);
    res.json({ success: true, data: mapRowToExpense(updated) });
}));
/**
 * DELETE /api/expenses/:id — Delete expense
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Expense not found', 404, 'NOT_FOUND');
    database_1.default.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    (0, replicator_1.queueSync)('expenses', req.params.id, 'delete', null);
    res.json({ success: true, message: 'Expense deleted' });
}));
/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToExpense(row) {
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
exports.default = router;
