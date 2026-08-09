"use strict";
/**
 * Driver Payments & Ledger — CRUD API Routes
 * Handles all /api/driver-payments/* endpoints
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
 * What a driver is owed for one resale.
 *
 * driver_cost is the wage for a SINGLE trip; trip_count says how many trips
 * the delivery actually took. Kept in one place because the same figure is
 * needed by the summary, the statement and the FIFO allocation query, and
 * they must never disagree about what is owed.
 */
function resaleDriverWage(row) {
    return Math.max(1, row.trip_count ?? 1) * row.driver_cost;
}
/** SQL equivalent of resaleDriverWage(), for queries that cannot use it. */
const RESALE_DRIVER_WAGE_SQL = 'MAX(1, COALESCE(trip_count, 1)) * driver_cost';
/**
 * Helper: Recalculate trip/resale driver_paid from allocations table
 */
function syncTripDriverPaid(tripType, tripId) {
    const table = tripType === 'transport' ? 'client_trips' : 'material_resales';
    const sumRow = database_1.default.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_allocated
    FROM driver_payment_allocations
    WHERE trip_type = ? AND trip_id = ?
  `).get(tripType, tripId);
    database_1.default.prepare(`
    UPDATE ${table}
    SET driver_paid = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sumRow.total_allocated, tripId);
}
/**
 * GET /api/driver-payments — List all driver payments with allocations
 */
router.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { driverName, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM driver_payments WHERE 1=1';
    const params = [];
    if (driverName && typeof driverName === 'string' && driverName.trim()) {
        sql += ' AND driver_name = ?';
        params.push(driverName.trim());
    }
    if (dateStart && typeof dateStart === 'string') {
        sql += ' AND date >= ?';
        params.push(dateStart);
    }
    if (dateEnd && typeof dateEnd === 'string') {
        sql += ' AND date <= ?';
        params.push(dateEnd);
    }
    sql += ' ORDER BY date DESC, id DESC';
    const rows = database_1.default.prepare(sql).all(...params);
    const payments = rows.map(p => {
        const allocations = database_1.default.prepare(`
      SELECT * FROM driver_payment_allocations WHERE payment_id = ?
    `).all(p.id);
        const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
        return {
            id: p.id,
            date: p.date,
            driverName: p.driver_name,
            amount: p.amount,
            paymentType: p.payment_type ?? 'Settlement',
            notes: p.notes ?? '',
            allocatedAmount,
            unallocatedAmount: p.amount - allocatedAmount,
            allocations: allocations.map(a => ({
                id: a.id,
                paymentId: a.payment_id,
                tripType: a.trip_type,
                tripId: a.trip_id,
                amount: a.amount
            })),
            createdAt: p.created_at,
            updatedAt: p.updated_at
        };
    });
    res.json({ success: true, data: payments });
}));
/**
 * GET /api/driver-payments/next-id — Next sequential ID (PAY-D1, PAY-D2, ...)
 */
router.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const rows = database_1.default.prepare('SELECT id FROM driver_payments').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/PAY-D(\d+)/i);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    res.json({ success: true, data: { nextId: `PAY-D${max + 1}` } });
}));
/**
 * GET /api/driver-payments/summary — Summary statistics for all drivers
 */
router.get('/summary', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const driverRows = database_1.default.prepare(`
    SELECT driver_name as name FROM client_trips WHERE driver_name != ''
    UNION
    SELECT driver_name as name FROM material_resales WHERE driver_name != ''
    UNION
    SELECT driver_name as name FROM driver_payments WHERE driver_name != ''
  `).all();
    const driverSummaries = driverRows.map(({ name }) => {
        // 1. Transport Trips for driver
        const trips = database_1.default.prepare('SELECT * FROM client_trips WHERE driver_name = ?').all(name);
        let transportEarned = 0;
        let transportPaid = 0;
        trips.forEach(t => {
            transportEarned += t.driver_cut;
            transportPaid += (t.driver_paid ?? 0);
        });
        // 2. Material Resales for driver
        const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE driver_name = ?').all(name);
        let resaleEarned = 0;
        let resalePaid = 0;
        // driver_cost is the wage for ONE trip, so a multi-trip delivery earns
        // that wage once per trip.
        resales.forEach(r => {
            resaleEarned += resaleDriverWage(r);
            resalePaid += (r.driver_paid ?? 0);
        });
        const totalEarned = transportEarned + resaleEarned;
        // 3. Driver Payments recorded
        const payments = database_1.default.prepare('SELECT * FROM driver_payments WHERE driver_name = ?').all(name);
        const totalPaymentsGiven = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalAllocatedPaid = transportPaid + resalePaid;
        const advanceBalance = Math.max(0, totalPaymentsGiven - totalAllocatedPaid);
        const outstandingPayable = Math.max(0, totalEarned - totalPaymentsGiven);
        const totalTripsCount = trips.length + resales.length;
        const unpaidTripsCount = trips.filter(t => (t.driver_paid ?? 0) < t.driver_cut).length +
            resales.filter(r => (r.driver_paid ?? 0) < resaleDriverWage(r)).length;
        return {
            driverName: name,
            totalEarned,
            totalPaymentsGiven,
            totalAllocatedPaid,
            outstandingPayable,
            advanceBalance,
            totalTripsCount,
            unpaidTripsCount
        };
    });
    res.json({ success: true, data: driverSummaries });
}));
/**
 * GET /api/driver-payments/statement/:driverName — Full statement for a specific driver
 */
router.get('/statement/:driverName', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const name = req.params.driverName;
    const trips = database_1.default.prepare('SELECT * FROM client_trips WHERE driver_name = ? ORDER BY date DESC').all(name);
    const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE driver_name = ? ORDER BY date DESC').all(name);
    const payments = database_1.default.prepare('SELECT * FROM driver_payments WHERE driver_name = ? ORDER BY date DESC').all(name);
    const itemizedTrips = [
        ...trips.map(t => ({
            type: 'transport',
            id: t.id,
            date: t.date,
            clientName: t.client_name,
            destination: t.destination,
            materialType: t.material_type,
            totalTonnage: t.total_tonnage,
            quantityUnit: t.quantity_unit ?? 'طن',
            driverEarned: t.driver_cut,
            driverPaid: t.driver_paid ?? 0,
            remaining: t.driver_cut - (t.driver_paid ?? 0)
        })),
        ...resales.map(r => ({
            type: 'resale',
            id: r.id,
            date: r.date,
            clientName: r.end_client,
            destination: r.destination,
            materialType: r.material_type,
            totalTonnage: r.total_tonnage,
            quantityUnit: r.quantity_unit ?? 'طن',
            driverEarned: resaleDriverWage(r),
            driverPaid: r.driver_paid ?? 0,
            remaining: resaleDriverWage(r) - (r.driver_paid ?? 0)
        }))
    ].sort((a, b) => b.date.localeCompare(a.date));
    const totalEarned = itemizedTrips.reduce((sum, item) => sum + item.driverEarned, 0);
    const totalAllocatedPaid = itemizedTrips.reduce((sum, item) => sum + item.driverPaid, 0);
    const totalPaymentsGiven = payments.reduce((sum, p) => sum + p.amount, 0);
    const advanceBalance = Math.max(0, totalPaymentsGiven - totalAllocatedPaid);
    const outstandingPayable = Math.max(0, totalEarned - totalPaymentsGiven);
    res.json({
        success: true,
        data: {
            driverName: name,
            summary: {
                totalEarned,
                totalPaymentsGiven,
                totalAllocatedPaid,
                outstandingPayable,
                advanceBalance
            },
            itemizedTrips,
            payments: payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                paymentType: p.payment_type ?? 'Settlement',
                notes: p.notes ?? ''
            }))
        }
    });
}));
/**
 * POST /api/driver-payments — Record a driver payout & handle allocation
 */
router.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id: reqId, date, driverName, amount, paymentType, notes, allocationMode, allocations } = req.body;
    if (!date || !driverName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, driverName, amount', 400, 'VALIDATION_ERROR');
    }
    let id = reqId;
    if (!id) {
        const rows = database_1.default.prepare('SELECT id FROM driver_payments').all();
        const max = rows.reduce((m, r) => {
            const match = r.id.match(/PAY-D(\d+)/i);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 0);
        id = `PAY-D${max + 1}`;
    }
    const executePaymentTx = database_1.default.transaction(() => {
        database_1.default.prepare(`
      INSERT INTO driver_payments (id, date, driver_name, amount, payment_type, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, driverName, amount, paymentType || 'Settlement', notes || '');
        let remainingToAllocate = amount;
        if (allocationMode === 'manual' && Array.isArray(allocations)) {
            for (const alloc of allocations) {
                if (!alloc.tripId || !alloc.tripType || alloc.amount <= 0)
                    continue;
                const allocAmt = Math.min(alloc.amount, remainingToAllocate);
                if (allocAmt <= 0)
                    break;
                database_1.default.prepare(`
          INSERT INTO driver_payment_allocations (payment_id, trip_type, trip_id, amount)
          VALUES (?, ?, ?, ?)
        `).run(id, alloc.tripType, alloc.tripId, allocAmt);
                syncTripDriverPaid(alloc.tripType, alloc.tripId);
                remainingToAllocate -= allocAmt;
            }
        }
        else if (allocationMode === 'auto') {
            // Auto FIFO: fetch unpaid/partially paid trips for this driver ordered by date ASC
            const trips = database_1.default.prepare(`
        SELECT id, 'transport' as trip_type, date, driver_cut as total_wage, driver_paid
        FROM client_trips
        WHERE driver_name = ? AND driver_paid < driver_cut
        ORDER BY date ASC
      `).all(driverName);
            const resales = database_1.default.prepare(`
        SELECT id, 'resale' as trip_type, date, ${RESALE_DRIVER_WAGE_SQL} as total_wage, driver_paid
        FROM material_resales
        WHERE driver_name = ? AND driver_paid < ${RESALE_DRIVER_WAGE_SQL}
        ORDER BY date ASC
      `).all(driverName);
            const combinedUnpaid = [...trips, ...resales].sort((a, b) => a.date.localeCompare(b.date));
            for (const item of combinedUnpaid) {
                if (remainingToAllocate <= 0)
                    break;
                const due = item.total_wage - (item.driver_paid ?? 0);
                if (due <= 0)
                    continue;
                const allocAmt = Math.min(due, remainingToAllocate);
                database_1.default.prepare(`
          INSERT INTO driver_payment_allocations (payment_id, trip_type, trip_id, amount)
          VALUES (?, ?, ?, ?)
        `).run(id, item.trip_type, item.id, allocAmt);
                syncTripDriverPaid(item.trip_type, item.id);
                remainingToAllocate -= allocAmt;
            }
        }
    });
    executePaymentTx();
    const created = database_1.default.prepare('SELECT * FROM driver_payments WHERE id = ?').get(id);
    (0, replicator_1.queueSync)('driver_payments', id, 'upsert', created);
    res.status(201).json({ success: true, data: created });
}));
/**
 * DELETE /api/driver-payments/:id — Delete driver payment and rollback allocations
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const deleteTx = database_1.default.transaction(() => {
        const allocations = database_1.default.prepare(`
      SELECT trip_type, trip_id FROM driver_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        database_1.default.prepare('DELETE FROM driver_payment_allocations WHERE payment_id = ?').run(paymentId);
        database_1.default.prepare('DELETE FROM driver_payments WHERE id = ?').run(paymentId);
        for (const alloc of allocations) {
            syncTripDriverPaid(alloc.trip_type, alloc.trip_id);
        }
    });
    deleteTx();
    (0, replicator_1.queueSync)('driver_payments', paymentId, 'delete', null);
    res.json({ success: true, message: 'Driver payout deleted and allocations reverted' });
}));
exports.default = router;
