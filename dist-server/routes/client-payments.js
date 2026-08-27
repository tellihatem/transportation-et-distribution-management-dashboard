"use strict";
/**
 * Client Payments & Ledger — CRUD API Routes
 * Handles all /api/client-payments/* endpoints
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
 * GET /api/client-payments — List all client payments with allocations
 */
router.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { clientName, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM client_payments WHERE 1=1';
    const params = [];
    if (clientName && typeof clientName === 'string' && clientName.trim()) {
        sql += ' AND client_name = ?';
        params.push(clientName.trim());
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
      SELECT * FROM client_payment_allocations WHERE payment_id = ?
    `).all(p.id);
        const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
        return {
            id: p.id,
            date: p.date,
            clientName: p.client_name,
            amount: p.amount,
            paymentMethod: p.payment_method ?? 'Cash',
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
 * GET /api/client-payments/next-id — Next sequential ID (PAY-C1, PAY-C2, ...)
 */
router.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const rows = database_1.default.prepare('SELECT id FROM client_payments').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/PAY-C(\d+)/i);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    res.json({ success: true, data: { nextId: `PAY-C${max + 1}` } });
}));
/**
 * GET /api/client-payments/summary — Summary statistics for all clients
 */
router.get('/summary', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    // Collect all distinct client names from trips, resales, and payments
    const clientRows = database_1.default.prepare(`
    SELECT client_name as name FROM client_trips WHERE client_name != ''
    UNION
    SELECT end_client as name FROM material_resales WHERE end_client != ''
    UNION
    SELECT client_name as name FROM client_payments WHERE client_name != ''
  `).all();
    const clientSummaries = clientRows.map(({ name }) => {
        // 1. Transport Trips for client
        const trips = database_1.default.prepare('SELECT * FROM client_trips WHERE client_name = ?').all(name);
        let transportInvoiced = 0;
        let transportPaid = 0;
        trips.forEach(t => {
            const fee = (0, trip_math_1.tripClientFee)({ truckCost: t.truck_cost });
            transportInvoiced += fee;
            transportPaid += (t.client_paid ?? 0);
        });
        // 2. Material Resales for client
        const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE end_client = ?').all(name);
        let resaleInvoiced = 0;
        let resalePaid = 0;
        resales.forEach(r => {
            resaleInvoiced += r.client_selling_price;
            resalePaid += (r.client_paid ?? 0);
        });
        const totalInvoiced = transportInvoiced + resaleInvoiced;
        // 3. Client Payments recorded
        const payments = database_1.default.prepare('SELECT * FROM client_payments WHERE client_name = ?').all(name);
        const totalPaymentsReceived = payments.reduce((sum, p) => sum + p.amount, 0);
        // Allocations sum
        const totalAllocatedPaid = transportPaid + resalePaid;
        const unallocatedCredit = Math.max(0, totalPaymentsReceived - totalAllocatedPaid);
        const outstandingReceivable = Math.max(0, totalInvoiced - totalAllocatedPaid);
        const totalTripsCount = trips.length + resales.length;
        const unpaidTripsCount = trips.filter(t => (t.client_paid ?? 0) < (0, trip_math_1.tripClientFee)({ truckCost: t.truck_cost })).length +
            resales.filter(r => (r.client_paid ?? 0) < r.client_selling_price).length;
        return {
            clientName: name,
            totalInvoiced,
            totalPaymentsReceived,
            totalAllocatedPaid,
            outstandingReceivable,
            unallocatedCredit,
            totalTripsCount,
            unpaidTripsCount
        };
    });
    res.json({ success: true, data: clientSummaries });
}));
/**
 * GET /api/client-payments/statement/:clientName — Full statement for a specific client
 */
router.get('/statement/:clientName', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const name = req.params.clientName;
    const trips = database_1.default.prepare('SELECT * FROM client_trips WHERE client_name = ? ORDER BY date DESC').all(name);
    const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE end_client = ? ORDER BY date DESC').all(name);
    const payments = database_1.default.prepare('SELECT * FROM client_payments WHERE client_name = ? ORDER BY date DESC').all(name);
    const itemizedTrips = [
        ...trips.map(t => {
            const fee = (0, trip_math_1.tripClientFee)({ truckCost: t.truck_cost });
            return {
                type: 'transport',
                id: t.id,
                date: t.date,
                destination: t.destination,
                materialType: t.material_type,
                totalTonnage: t.total_tonnage,
                quantityUnit: t.quantity_unit ?? 'طن',
                totalPrice: fee,
                clientPaid: t.client_paid ?? 0,
                remaining: fee - (t.client_paid ?? 0)
            };
        }),
        ...resales.map(r => ({
            type: 'resale',
            id: r.id,
            date: r.date,
            destination: r.destination,
            materialType: r.material_type,
            totalTonnage: r.total_tonnage,
            quantityUnit: r.quantity_unit ?? 'طن',
            totalPrice: r.client_selling_price,
            clientPaid: r.client_paid ?? 0,
            remaining: r.client_selling_price - (r.client_paid ?? 0)
        }))
    ].sort((a, b) => b.date.localeCompare(a.date));
    const totalInvoiced = itemizedTrips.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalAllocatedPaid = itemizedTrips.reduce((sum, item) => sum + item.clientPaid, 0);
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + p.amount, 0);
    const unallocatedCredit = Math.max(0, totalPaymentsReceived - totalAllocatedPaid);
    const outstandingReceivable = Math.max(0, totalInvoiced - totalAllocatedPaid);
    res.json({
        success: true,
        data: {
            clientName: name,
            summary: {
                totalInvoiced,
                totalPaymentsReceived,
                totalAllocatedPaid,
                outstandingReceivable,
                unallocatedCredit
            },
            itemizedTrips,
            payments: payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                paymentMethod: p.payment_method ?? 'Cash',
                notes: p.notes ?? '',
                // How much of this payment is currently applied to shipments/trips.
                // The edit dialog reads it so correcting an unapplied advance does not
                // silently turn it into a settlement.
                allocatedAmount: database_1.default.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM client_payment_allocations WHERE payment_id = ?').get(p.id).total
            }))
        }
    });
}));
/**
 * POST /api/client-payments — Record a client payment & handle allocation
 */
router.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id: reqId, date, clientName, amount, paymentMethod, notes, allocationMode, allocations } = req.body;
    if (!date || !clientName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, clientName, amount', 400, 'VALIDATION_ERROR');
    }
    // Generate ID if not provided
    let id = reqId;
    if (!id) {
        const rows = database_1.default.prepare('SELECT id FROM client_payments').all();
        const max = rows.reduce((m, r) => {
            const match = r.id.match(/PAY-C(\d+)/i);
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, 0);
        id = `PAY-C${max + 1}`;
    }
    // Transaction for strict atomic execution
    const executePaymentTx = database_1.default.transaction(() => {
        // Insert into client_payments
        database_1.default.prepare(`
      INSERT INTO client_payments (id, date, client_name, amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, clientName, amount, paymentMethod || 'Cash', notes || '');
        let remainingToAllocate = amount;
        if (allocationMode === 'manual' && Array.isArray(allocations)) {
            for (const alloc of allocations) {
                if (!alloc.tripId || !alloc.tripType || alloc.amount <= 0)
                    continue;
                const allocAmt = Math.min(alloc.amount, remainingToAllocate);
                if (allocAmt <= 0)
                    break;
                database_1.default.prepare(`
          INSERT INTO client_payment_allocations (payment_id, trip_type, trip_id, amount)
          VALUES (?, ?, ?, ?)
        `).run(id, alloc.tripType, alloc.tripId, allocAmt);
                (0, ledgers_1.syncTripClientPaid)(alloc.tripType, alloc.tripId);
                remainingToAllocate -= allocAmt;
            }
        }
        else if (allocationMode === 'auto') {
            // Same routine the correction path uses, so the two cannot diverge.
            remainingToAllocate = (0, ledgers_1.allocateClientPayment)(id, clientName, remainingToAllocate);
        }
    });
    executePaymentTx();
    const created = database_1.default.prepare('SELECT * FROM client_payments WHERE id = ?').get(id);
    (0, replicator_1.queueSync)('client_payments', id, 'upsert', created);
    res.status(201).json({ success: true, data: created });
}));
/**
 * PUT /api/client-payments/:id — Correct a receipt entered wrongly
 *
 * The old allocations are removed and every trip they touched recalculated
 * before the corrected amount is re-applied, so lowering an amount correctly
 * returns trips to unpaid rather than leaving them settled by money that is
 * no longer there.
 */
router.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const { date, clientName, amount, paymentMethod, notes, allocationMode } = req.body;
    if (!date || !clientName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, clientName, amount', 400, 'VALIDATION_ERROR');
    }
    const updateTx = database_1.default.transaction(() => {
        const previous = database_1.default.prepare(`
      SELECT trip_type, trip_id FROM client_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        database_1.default.prepare('DELETE FROM client_payment_allocations WHERE payment_id = ?').run(paymentId);
        for (const alloc of previous) {
            (0, ledgers_1.syncTripClientPaid)(alloc.trip_type, alloc.trip_id);
        }
        database_1.default.prepare(`
      UPDATE client_payments
      SET date = ?, client_name = ?, amount = ?, payment_method = ?, notes = ?,
          updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, clientName, amount, paymentMethod || 'Cash', notes || '', paymentId);
        // 'none' leaves the money unallocated — a deposit, same as on create.
        if (allocationMode === 'auto') {
            (0, ledgers_1.allocateClientPayment)(paymentId, clientName, amount);
        }
    });
    updateTx();
    const updated = database_1.default.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
    res.json({ success: true, data: updated });
}));
/**
 * DELETE /api/client-payments/:id — Delete client payment and rollback allocations
 */
router.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const deleteTx = database_1.default.transaction(() => {
        // Find all allocations to sync affected trips afterwards
        const allocations = database_1.default.prepare(`
      SELECT trip_type, trip_id FROM client_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        // Delete allocations
        database_1.default.prepare('DELETE FROM client_payment_allocations WHERE payment_id = ?').run(paymentId);
        // Delete payment
        database_1.default.prepare('DELETE FROM client_payments WHERE id = ?').run(paymentId);
        // Sync affected trips
        for (const alloc of allocations) {
            (0, ledgers_1.syncTripClientPaid)(alloc.trip_type, alloc.trip_id);
        }
    });
    deleteTx();
    (0, replicator_1.queueSync)('client_payments', paymentId, 'delete', null);
    res.json({ success: true, message: 'Payment deleted and allocations reverted' });
}));
exports.default = router;
