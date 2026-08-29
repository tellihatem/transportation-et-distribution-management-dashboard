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
const ledgers_1 = require("../ledgers");
const trip_math_1 = require("../trip-math");
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
        sql += ` AND (id LIKE ? OR client_name LIKE ? OR origin_factory LIKE ? OR destination LIKE ? OR material_type LIKE ? OR driver_name LIKE ?)`;
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
    let grossRevenue = 0;
    let driverPayout = 0;
    let netMargin = 0;
    let totalTons = 0;
    rows.forEach((row) => {
        const tripFee = (0, trip_math_1.tripClientFee)({ truckCost: row.truck_cost });
        grossRevenue += tripFee;
        driverPayout += row.driver_cut;
        // Recomputed, not read from the stored column: rows that arrived by
        // backup import or cloud restore may carry a stale company_profit, and
        // these three figures must always reconcile (revenue = payout + margin).
        netMargin += (0, trip_math_1.tripCompanyProfit)({ truckCost: row.truck_cost, driverCut: row.driver_cut });
        totalTons += row.total_tonnage;
    });
    res.json({ success: true, data: { grossRevenue, driverPayout, netMargin, totalTons } });
}));
/**
 * GET /api/trips/next-id — Next sequential trip ID (TR-1, TR-2, ...)
 */
router.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const rows = database_1.default.prepare('SELECT id FROM client_trips').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/(\d+)\s*$/);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    res.json({ success: true, data: { nextId: `TR-${max + 1}` } });
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
    const { id, date, clientName, originFactory, destination, materialType, totalTonnage, quantityUnit, truckCost, driverCut, companyProfit, driverName } = req.body;
    if (!id || !date || !clientName) {
        throw (0, error_handler_1.createApiError)('Missing required fields: id, date, clientName', 400, 'VALIDATION_ERROR');
    }
    // Every trip must name its driver: the wage reduces profit, so without a
    // name it would be a cost owed to nobody, invisible to every ledger.
    if (!driverName || !String(driverName).trim()) {
        throw (0, error_handler_1.createApiError)('Missing required field: driverName', 400, 'VALIDATION_ERROR');
    }
    const negative = (0, trip_math_1.firstNegativeMoneyField)({ truckCost, driverCut, totalTonnage });
    if (negative) {
        throw (0, error_handler_1.createApiError)(`Field ${negative} must not be negative`, 400, 'VALIDATION_ERROR');
    }
    // Check for duplicate ID
    const existing = database_1.default.prepare('SELECT id FROM client_trips WHERE id = ?').get(id);
    if (existing) {
        throw (0, error_handler_1.createApiError)('Trip ID already exists', 409, 'DUPLICATE_ID');
    }
    // The hire is the client's price and the wage comes out of it, so the
    // profit is computed here rather than accepted from the caller — no screen
    // can post a figure that does not follow from the other two.
    const profit = (0, trip_math_1.tripCompanyProfit)({ truckCost: truckCost || 0, driverCut: driverCut || 0 });
    database_1.default.prepare(`
    INSERT INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, quantity_unit, truck_cost, driver_cut, company_profit, driver_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, clientName, originFactory || '', destination || '', materialType || '', totalTonnage || 0, quantityUnit || 'طن', truckCost || 0, driverCut || 0, profit, driverName || '');
    (0, ledgers_1.reconcileWork)({ tripType: 'transport', tripId: id, clientNames: [clientName], driverNames: [driverName] });
    const created = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(id);
    // Queue async sync to Supabase
    (0, replicator_1.queueSync)('client_trips', id, 'upsert', created);
    res.status(201).json({ success: true, data: mapRowToTrip(created) });
}));
/**
 * PUT /api/trips/:id — Update existing trip
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Trip not found', 404, 'NOT_FOUND');
    const { date, clientName, originFactory, destination, materialType, totalTonnage, quantityUnit, truckCost, driverCut, driverName } = req.body;
    if (!driverName || !String(driverName).trim()) {
        throw (0, error_handler_1.createApiError)('Missing required field: driverName', 400, 'VALIDATION_ERROR');
    }
    const negativePut = (0, trip_math_1.firstNegativeMoneyField)({ truckCost, driverCut, totalTonnage });
    if (negativePut) {
        throw (0, error_handler_1.createApiError)(`Field ${negativePut} must not be negative`, 400, 'VALIDATION_ERROR');
    }
    // One transaction: the row update and the ledger reconciliation stand or
    // fall together, like the DELETE path already does.
    const updateTx = database_1.default.transaction(() => {
        database_1.default.prepare(`
    UPDATE client_trips SET
      date = ?, client_name = ?, origin_factory = ?, destination = ?,
      material_type = ?, total_tonnage = ?, quantity_unit = ?, truck_cost = ?, driver_cut = ?,
      company_profit = ?, driver_name = ?,
      updated_at = datetime('now'), synced_at = NULL
    WHERE id = ?
  `).run(date, clientName, originFactory, destination, materialType, totalTonnage, quantityUnit || 'طن', truckCost, driverCut, (0, trip_math_1.tripCompanyProfit)({ truckCost, driverCut }), driverName || '', req.params.id);
        // Both the old and new parties are reconciled: a trip moved to another
        // client hands its money back to the first one as credit.
        (0, ledgers_1.reconcileWork)({
            tripType: 'transport',
            tripId: req.params.id,
            clientNames: [clientName, existing.client_name],
            driverNames: [driverName, existing.driver_name],
        });
    });
    updateTx();
    const updated = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
    (0, replicator_1.queueSync)('client_trips', req.params.id, 'upsert', updated);
    res.json({ success: true, data: mapRowToTrip(updated) });
}));
/**
 * DELETE /api/trips/:id — Delete trip
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const existing = database_1.default.prepare('SELECT * FROM client_trips WHERE id = ?').get(req.params.id);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Trip not found', 404, 'NOT_FOUND');
    // Allocation rows have no FK to this table — remove the ones pointing at
    // the deleted trip so payment histories don't reference a record that no
    // longer exists.
    const deleteTx = database_1.default.transaction(() => {
        database_1.default.prepare(`DELETE FROM driver_payment_allocations WHERE trip_type = 'transport' AND trip_id = ?`).run(req.params.id);
        database_1.default.prepare(`DELETE FROM client_payment_allocations WHERE trip_type = 'transport' AND trip_id = ?`).run(req.params.id);
        database_1.default.prepare('DELETE FROM client_trips WHERE id = ?').run(req.params.id);
    });
    deleteTx();
    // The money that was settling this trip is free again — let it settle
    // whatever else this client and driver still have outstanding.
    (0, ledgers_1.reconcileWork)({
        tripType: 'transport',
        clientNames: [existing.client_name],
        driverNames: [existing.driver_name],
    });
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
        quantityUnit: row.quantity_unit ?? 'طن',
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
exports.default = router;
