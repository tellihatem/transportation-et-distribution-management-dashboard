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
const resale_math_1 = require("../resale-math");
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
        sql += ` AND (id LIKE ? OR end_client LIKE ? OR destination LIKE ? OR driver_name LIKE ? OR material_type LIKE ? OR origin_factory LIKE ?)`;
        const term = `%${search.trim()}%`;
        params.push(term, term, term, term, term, term);
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
    let tradingTurnover = 0; // total invoiced to clients (goods + transport)
    let capitalOutlay = 0; // what the goods cost us
    let grossProductProfit = 0; // goods margin, before any transport
    let transportTotal = 0; // trips × cost per trip
    let hiddenProfit = 0;
    let totalTrueProfit = 0; // net real profit
    let totalTons = 0;
    rows.forEach((row) => {
        const m = (0, resale_math_1.calcResale)(mapRowToResale(row));
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
router.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const rows = database_1.default.prepare('SELECT id FROM material_resales').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/(\d+)\s*$/);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    res.json({ success: true, data: { nextId: `RS-${max + 1}` } });
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
    const { id, date, endClient, destination, materialType, originFactory, factoryPurchasePrice, productUnitPrice, totalTonnage, quantityUnit, truckCost, driverCost, explicitProfit, driverName, tripCount } = req.body;
    if (!id || !date || !endClient) {
        throw (0, error_handler_1.createApiError)('Missing required fields: id, date, endClient', 400, 'VALIDATION_ERROR');
    }
    const existing = database_1.default.prepare('SELECT id FROM material_resales WHERE id = ?').get(id);
    if (existing) {
        throw (0, error_handler_1.createApiError)('Resale ID already exists', 409, 'DUPLICATE_ID');
    }
    // The invoice total is never accepted from the client: it is derived from
    // the goods and transport figures, so the two invoice lines always add up
    // to the amount the ledgers settle against.
    const trips = (0, resale_math_1.resaleTripCount)({ tripCount });
    const invoiceTotal = (0, resale_math_1.calcInvoiceTotal)({
        factoryPurchasePrice: factoryPurchasePrice || 0,
        productUnitPrice: productUnitPrice || 0,
        totalTonnage: totalTonnage || 0,
        truckCost: truckCost || 0,
        driverCost: driverCost || 0,
        explicitProfit: explicitProfit || 0,
        tripCount: trips,
    });
    database_1.default.prepare(`
    INSERT INTO material_resales (id, date, end_client, destination, material_type, origin_factory, factory_purchase_price, product_unit_price, total_tonnage, quantity_unit, client_selling_price, truck_cost, driver_cost, explicit_profit, driver_name, trip_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, endClient, destination || '', materialType || '', originFactory || '', factoryPurchasePrice || 0, productUnitPrice || 0, totalTonnage || 0, quantityUnit || 'طن', invoiceTotal, truckCost || 0, driverCost || 0, explicitProfit || 0, driverName || '', trips);
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
    const { date, endClient, destination, materialType, originFactory, factoryPurchasePrice, productUnitPrice, totalTonnage, quantityUnit, truckCost, driverCost, explicitProfit, driverName, tripCount } = req.body;
    const trips = (0, resale_math_1.resaleTripCount)({ tripCount });
    const invoiceTotal = (0, resale_math_1.calcInvoiceTotal)({
        factoryPurchasePrice, productUnitPrice: productUnitPrice || 0,
        totalTonnage, truckCost, driverCost, explicitProfit, tripCount: trips,
    });
    database_1.default.prepare(`
    UPDATE material_resales SET
      date = ?, end_client = ?, destination = ?, material_type = ?, origin_factory = ?, factory_purchase_price = ?, product_unit_price = ?, total_tonnage = ?, quantity_unit = ?,
      client_selling_price = ?, truck_cost = ?, driver_cost = ?,
      explicit_profit = ?, driver_name = ?, trip_count = ?,
      updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, endClient, destination || '', materialType || '', originFactory || '', factoryPurchasePrice, productUnitPrice || 0, totalTonnage, quantityUnit || 'طن', invoiceTotal, truckCost, driverCost, explicitProfit, driverName || '', trips, req.params.id);
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
exports.default = router;
