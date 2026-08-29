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
const ledgers_1 = require("../ledgers");
// NOTE deliberately no queueSync here: the payment/allocation tables are
// local-only (no Supabase mirror). Queuing deletes for them errors into
// sync_queue and retries forever — see server/routes/suppliers.ts for the
// same decision documented on the supplier ledger.
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
    // Aggregate per table instead of three full scans per driver — same
    // rationale as the client summary: this refires on every write and runs on
    // the Electron main thread.
    const tripAgg = new Map();
    for (const r of database_1.default.prepare(`
    SELECT driver_name as name,
           SUM(driver_cut) as earned,
           SUM(COALESCE(driver_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(driver_paid, 0) < driver_cut - ${ledgers_1.MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM client_trips WHERE driver_name != '' GROUP BY driver_name
  `).all())
        tripAgg.set(r.name, r);
    const resaleAgg = new Map();
    for (const r of database_1.default.prepare(`
    SELECT driver_name as name,
           SUM(${ledgers_1.RESALE_DRIVER_WAGE_SQL}) as earned,
           SUM(COALESCE(driver_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(driver_paid, 0) < ${ledgers_1.RESALE_DRIVER_WAGE_SQL} - ${ledgers_1.MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM material_resales WHERE driver_name != '' GROUP BY driver_name
  `).all())
        resaleAgg.set(r.name, r);
    const payAgg = new Map();
    for (const r of database_1.default.prepare(`
    SELECT driver_name as name, SUM(amount) as total
    FROM driver_payments WHERE driver_name != '' GROUP BY driver_name
  `).all())
        payAgg.set(r.name, r.total);
    const names = new Set([...tripAgg.keys(), ...resaleAgg.keys(), ...payAgg.keys()]);
    const driverSummaries = [...names].map(name => {
        const t = tripAgg.get(name);
        const r = resaleAgg.get(name);
        const totalEarned = (t?.earned ?? 0) + (r?.earned ?? 0);
        const totalAllocatedPaid = (t?.paid ?? 0) + (r?.paid ?? 0);
        const totalPaymentsGiven = payAgg.get(name) ?? 0;
        // Not yet applied to any trip — the figure the drawdown views track.
        const advanceBalance = Math.max(0, totalPaymentsGiven - totalAllocatedPaid);
        // Paid beyond everything EARNED — the only part the profit views deduct.
        const unearnedAdvance = Math.max(0, totalPaymentsGiven - totalEarned);
        // Work done and not settled, allocation basis like the other ledgers.
        const outstandingPayable = Math.max(0, totalEarned - totalAllocatedPaid);
        return {
            driverName: name,
            totalEarned,
            totalPaymentsGiven,
            totalAllocatedPaid,
            outstandingPayable,
            advanceBalance,
            unearnedAdvance,
            totalTripsCount: (t?.cnt ?? 0) + (r?.cnt ?? 0),
            unpaidTripsCount: (t?.unpaid ?? 0) + (r?.unpaid ?? 0),
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
    const unearnedAdvance = Math.max(0, totalPaymentsGiven - totalEarned);
    const outstandingPayable = Math.max(0, totalEarned - totalAllocatedPaid);
    res.json({
        success: true,
        data: {
            driverName: name,
            summary: {
                totalEarned,
                totalPaymentsGiven,
                totalAllocatedPaid,
                outstandingPayable,
                advanceBalance,
                unearnedAdvance
            },
            itemizedTrips,
            payments: payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                paymentType: p.payment_type ?? 'Settlement',
                notes: p.notes ?? '',
                // How much of this payment is currently applied to shipments/trips.
                // The edit dialog reads it so correcting an unapplied advance does not
                // silently turn it into a settlement.
                allocatedAmount: database_1.default.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM driver_payment_allocations WHERE payment_id = ?').get(p.id).total
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
            try {
                remainingToAllocate = (0, ledgers_1.applyManualAllocations)('driver', id, driverName, remainingToAllocate, allocations);
            }
            catch (err) {
                throw (0, error_handler_1.createApiError)(err.message, 400, 'VALIDATION_ERROR');
            }
        }
        else if (allocationMode === 'auto') {
            // Same routine the correction path uses, so the two cannot diverge.
            remainingToAllocate = (0, ledgers_1.allocateDriverPayment)(id, driverName, remainingToAllocate);
        }
    });
    executePaymentTx();
    const created = database_1.default.prepare('SELECT * FROM driver_payments WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: created });
}));
/**
 * PUT /api/driver-payments/:id — Correct a payment that was entered wrongly
 *
 * A wrong amount cannot simply be overwritten: the original may already have
 * been spread across several trips. So the old allocations are removed first
 * and every trip they touched is recalculated, then the corrected amount is
 * allocated afresh. Trips the payment used to cover are refreshed even when
 * the new allocation no longer reaches them, which is what makes reducing an
 * amount — or moving the payment to a different driver — come out right.
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const { date, driverName, amount, paymentType, notes, allocationMode, allocations } = req.body;
    if (!date || !driverName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, driverName, amount', 400, 'VALIDATION_ERROR');
    }
    const updateTx = database_1.default.transaction(() => {
        // Remember what the old allocations touched so those trips can be
        // recalculated even if the corrected payment no longer reaches them.
        const previous = database_1.default.prepare(`
      SELECT trip_type, trip_id FROM driver_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        database_1.default.prepare('DELETE FROM driver_payment_allocations WHERE payment_id = ?').run(paymentId);
        for (const alloc of previous) {
            (0, ledgers_1.syncTripDriverPaid)(alloc.trip_type, alloc.trip_id);
        }
        database_1.default.prepare(`
      UPDATE driver_payments
      SET date = ?, driver_name = ?, amount = ?, payment_type = ?, notes = ?,
          updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, driverName, amount, paymentType || 'Settlement', notes || '', paymentId);
        // 'none' leaves the money unallocated — an advance, same as on create.
        if (allocationMode === 'auto') {
            (0, ledgers_1.allocateDriverPayment)(paymentId, driverName, amount);
        }
        else if (allocationMode === 'manual' && Array.isArray(allocations)) {
            // Same rules as POST — an edited receipt may keep hand-placed rows
            // rather than silently converting them into an advance.
            try {
                (0, ledgers_1.applyManualAllocations)('driver', paymentId, driverName, amount, allocations);
            }
            catch (err) {
                throw (0, error_handler_1.createApiError)(err.message, 400, 'VALIDATION_ERROR');
            }
        }
    });
    updateTx();
    (0, ledgers_1.applyDriverAdvance)(existing.driver_name);
    if (driverName !== existing.driver_name)
        (0, ledgers_1.applyDriverAdvance)(driverName);
    const updated = database_1.default.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId);
    res.json({ success: true, data: updated });
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
            (0, ledgers_1.syncTripDriverPaid)(alloc.trip_type, alloc.trip_id);
        }
    });
    deleteTx();
    // Same sweep as on the client side: freed wages resettle from any other
    // credit the driver still holds.
    (0, ledgers_1.applyDriverAdvance)(existing.driver_name);
    res.json({ success: true, message: 'Driver payout deleted and allocations reverted' });
}));
exports.default = router;
