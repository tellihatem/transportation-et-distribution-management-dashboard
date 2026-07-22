"use strict";
/**
 * Material Resale Transactions — CRUD API Routes
 * Handles all /api/resales/* endpoints
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
 * GET /api/resales — List all resale transactions with optional filters
 */
router.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM material_resales WHERE 1=1';
    const params = [];
    if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (
      id LIKE ? OR
      end_client LIKE ? OR
      destination LIKE ?
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
    const resales = rows.map(mapRowToResale);
    res.json({ success: true, data: resales });
}));
/**
 * GET /api/resales/stats — Computed stats for filtered resales
 */
router.get('/stats', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM material_resales WHERE 1=1';
    const params = [];
    if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (id LIKE ? OR end_client LIKE ? OR destination LIKE ?)`;
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
    let tradingTurnover = 0;
    let capitalOutlay = 0;
    let totalTrueProfit = 0;
    let totalTons = 0;
    rows.forEach((row) => {
        const sourcingCost = row.factory_purchase_price * row.total_tonnage;
        const visibleTransportFee = row.truck_cost + row.driver_cost + row.explicit_profit;
        const hiddenMargin = row.client_selling_price - (sourcingCost + visibleTransportFee);
        const trueProfit = row.explicit_profit + hiddenMargin;
        tradingTurnover += row.client_selling_price;
        capitalOutlay += sourcingCost;
        totalTrueProfit += trueProfit;
        totalTons += row.total_tonnage;
    });
    res.json({ success: true, data: { tradingTurnover, capitalOutlay, totalTrueProfit, totalTons } });
}));
/**
 * GET /api/resales/:id — Single resale
 */
router.get('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const row = database_1.default.prepare('SELECT * FROM material_resales WHERE id = ?').get(req.params.id);
    if (!row)
        throw (0, error_handler_1.createApiError)('Resale not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: mapRowToResale(row) });
}));
/**
 * POST /api/resales — Create new resale
 */
router.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id, date, endClient, destination, factoryPurchasePrice, totalTonnage, clientSellingPrice, truckCost, driverCost, explicitProfit } = req.body;
    if (!id || !date || !endClient) {
        throw (0, error_handler_1.createApiError)('Missing required fields: id, date, endClient', 400, 'VALIDATION_ERROR');
    }
    const existing = database_1.default.prepare('SELECT id FROM material_resales WHERE id = ?').get(id);
    if (existing) {
        throw (0, error_handler_1.createApiError)('Resale ID already exists', 409, 'DUPLICATE_ID');
    }
    database_1.default.prepare(`
    INSERT INTO material_resales (id, date, end_client, destination, factory_purchase_price, total_tonnage, client_selling_price, truck_cost, driver_cost, explicit_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, endClient, destination || '', factoryPurchasePrice || 0, totalTonnage || 0, clientSellingPrice || 0, truckCost || 0, driverCost || 0, explicitProfit || 0);
    const created = database_1.default.prepare('SELECT * FROM material_resales WHERE id = ?').get(id);
    (0, replicator_1.queueSync)('material_resales', id, 'upsert', created);
    res.status(201).json({ success: true, data: mapRowToResale(created) });
}));
/**
 * PUT /api/resales/:id — Update existing resale
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM material_resales WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Resale not found', 404, 'NOT_FOUND');
    const { date, endClient, destination, factoryPurchasePrice, totalTonnage, clientSellingPrice, truckCost, driverCost, explicitProfit } = req.body;
    database_1.default.prepare(`
    UPDATE material_resales SET
      date = ?, end_client = ?, destination = ?, factory_purchase_price = ?, total_tonnage = ?,
      client_selling_price = ?, truck_cost = ?, driver_cost = ?,
      explicit_profit = ?, updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, endClient, destination || '', factoryPurchasePrice, totalTonnage, clientSellingPrice, truckCost, driverCost, explicitProfit, req.params.id);
    const updated = database_1.default.prepare('SELECT * FROM material_resales WHERE id = ?').get(req.params.id);
    (0, replicator_1.queueSync)('material_resales', req.params.id, 'upsert', updated);
    res.json({ success: true, data: mapRowToResale(updated) });
}));
/**
 * DELETE /api/resales/:id — Delete resale
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM material_resales WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Resale not found', 404, 'NOT_FOUND');
    database_1.default.prepare('DELETE FROM material_resales WHERE id = ?').run(req.params.id);
    (0, replicator_1.queueSync)('material_resales', req.params.id, 'delete', null);
    res.json({ success: true, message: 'Resale deleted' });
}));
/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToResale(row) {
    return {
        id: row.id,
        date: row.date,
        endClient: row.end_client,
        destination: row.destination,
        factoryPurchasePrice: row.factory_purchase_price,
        totalTonnage: row.total_tonnage,
        clientSellingPrice: row.client_selling_price,
        truckCost: row.truck_cost,
        driverCost: row.driver_cost,
        explicitProfit: row.explicit_profit,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncedAt: row.synced_at,
    };
}
exports.default = router;
