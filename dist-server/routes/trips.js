"use strict";
/**
 * Client Transport Trips — CRUD API Routes
 * Handles all /api/trips/* endpoints
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
 * GET /api/trips — List all trips with optional search/date filters
 */
router.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM client_trips WHERE 1=1';
    const params = [];
    if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (
      id LIKE ? OR
      client_name LIKE ? OR
      origin_factory LIKE ? OR
      destination LIKE ? OR
      material_type LIKE ?
    )`;
        const term = `%${search.trim()}%`;
        params.push(term, term, term, term, term);
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
    // Map snake_case DB columns to camelCase for frontend
    const trips = rows.map(mapRowToTrip);
    res.json({ success: true, data: trips });
}));
/**
 * GET /api/trips/stats — Computed stats for filtered trips
 */
router.get('/stats', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { search, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM client_trips WHERE 1=1';
    const params = [];
    if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (id LIKE ? OR client_name LIKE ? OR origin_factory LIKE ? OR destination LIKE ? OR material_type LIKE ?)`;
        const term = `%${search.trim()}%`;
        params.push(term, term, term, term, term);
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
    let grossRevenue = 0;
    let driverPayout = 0;
    let netMargin = 0;
    let totalTons = 0;
    rows.forEach((row) => {
        const tripFee = row.truck_cost + row.driver_cut + row.company_profit;
        grossRevenue += tripFee;
        driverPayout += row.driver_cut;
        netMargin += row.company_profit;
        totalTons += row.total_tonnage;
    });
    res.json({ success: true, data: { grossRevenue, driverPayout, netMargin, totalTons } });
}));
/**
 * GET /api/trips/:id — Single trip
 */
router.get('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const row = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
    if (!row)
        throw (0, error_handler_1.createApiError)('Trip not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: mapRowToTrip(row) });
}));
/**
 * POST /api/trips — Create new trip
 */
router.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id, date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit } = req.body;
    if (!id || !date || !clientName) {
        throw (0, error_handler_1.createApiError)('Missing required fields: id, date, clientName', 400, 'VALIDATION_ERROR');
    }
    // Check for duplicate ID
    const existing = database_1.default.prepare('SELECT id FROM client_trips WHERE id = ?').get(id);
    if (existing) {
        throw (0, error_handler_1.createApiError)('Trip ID already exists', 409, 'DUPLICATE_ID');
    }
    database_1.default.prepare(`
    INSERT INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, truck_cost, driver_cut, company_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, clientName, originFactory || '', destination || '', materialType || '', totalTonnage || 0, truckCost || 0, driverCut || 0, companyProfit || 0);
    const created = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(id);
    // Queue async sync to Supabase
    (0, replicator_1.queueSync)('client_trips', id, 'upsert', created);
    res.status(201).json({ success: true, data: mapRowToTrip(created) });
}));
/**
 * PUT /api/trips/:id — Update existing trip
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM client_trips WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Trip not found', 404, 'NOT_FOUND');
    const { date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit } = req.body;
    database_1.default.prepare(`
    UPDATE client_trips SET
      date = ?, client_name = ?, origin_factory = ?, destination = ?,
      material_type = ?, total_tonnage = ?, truck_cost = ?, driver_cut = ?,
      company_profit = ?, updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, clientName, originFactory, destination, materialType, totalTonnage, truckCost, driverCut, companyProfit, req.params.id);
    const updated = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
    (0, replicator_1.queueSync)('client_trips', req.params.id, 'upsert', updated);
    res.json({ success: true, data: mapRowToTrip(updated) });
}));
/**
 * DELETE /api/trips/:id — Delete trip
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT id FROM client_trips WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Trip not found', 404, 'NOT_FOUND');
    database_1.default.prepare('DELETE FROM client_trips WHERE id = ?').run(req.params.id);
    (0, replicator_1.queueSync)('client_trips', req.params.id, 'delete', null);
    res.json({ success: true, message: 'Trip deleted' });
}));
/**
 * Map database row (snake_case) to frontend object (camelCase)
 */
function mapRowToTrip(row) {
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncedAt: row.synced_at,
    };
}
exports.default = router;
