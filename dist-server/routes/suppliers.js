"use strict";
/**
 * Supplier/Factory Ledger — /api/supplier-payments/* and /api/supplier-invoices/*
 *
 * Third instance of the ledger pattern (client-payments, driver-payments).
 * The supplier side has TWO debt sources:
 *   - every resale bought from the supplier (matched on origin_factory),
 *     owing its goods cost: factory_purchase_price × total_tonnage
 *   - manual supplier invoices, for purchases made outside any resale record
 *
 * Balances are NET (per the operator's choice): a prepayment simply offsets
 * whatever is owed. FIFO allocation rows are written only when a payment is
 * recorded, walking unpaid resales AND invoices together, oldest first.
 *
 * Deliberately no queueSync here: the ledger tables have no Supabase mirror,
 * so syncing would be a no-op for upserts and an error-into-queue for
 * deletes (the older ledgers inherited exactly that dead behaviour).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierInvoicesRouter = exports.supplierPaymentsRouter = void 0;
const express_1 = require("express");
const database_1 = __importDefault(require("../database"));
const error_handler_1 = require("../middleware/error-handler");
const resale_math_1 = require("../resale-math");
/**
 * What a resale owes its supplier: the goods cost only. Transport is paid to
 * the truck/driver, not the factory, and goods are bought once regardless of
 * how many trips the delivery took — so trip_count does NOT multiply here.
 *
 * The SQL constant is the query-side twin of resaleSupplierCost(); the two
 * are kept adjacent because the summary, the statement and the FIFO query
 * must never disagree about what is owed.
 */
function resaleSupplierCost(row) {
    return (0, resale_math_1.calcResale)({
        factoryPurchasePrice: row.factory_purchase_price,
        productUnitPrice: 0,
        totalTonnage: row.total_tonnage,
        truckCost: 0,
        driverCost: 0,
        explicitProfit: 0,
    }).totalBuyCost;
}
const RESALE_SUPPLIER_COST_SQL = 'factory_purchase_price * total_tonnage';
/**
 * Helper: recalculate the paid-cache on an allocation target from the
 * allocations table. Never increments — always Σ, so deletes self-correct.
 */
function syncTargetPaid(targetType, targetId) {
    const sumRow = database_1.default.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_allocated
    FROM supplier_payment_allocations
    WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);
    if (targetType === 'resale') {
        database_1.default.prepare(`
      UPDATE material_resales
      SET supplier_paid = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(sumRow.total_allocated, targetId);
    }
    else {
        database_1.default.prepare(`
      UPDATE supplier_invoices
      SET paid = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(sumRow.total_allocated, targetId);
    }
}
/**
 * Advance still sitting with a supplier: everything paid, minus everything
 * already deducted against shipments and invoices.
 */
function availableAdvance(supplierName) {
    const row = database_1.default.prepare(`
    SELECT
      COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_name = ?), 0)
      -
      COALESCE((
        SELECT SUM(a.amount)
        FROM supplier_payment_allocations a
        JOIN supplier_payments p ON p.id = a.payment_id
        WHERE p.supplier_name = ?
      ), 0) AS available
  `).get(supplierName, supplierName);
    return Math.max(0, row.available);
}
/**
 * What a shipment or invoice still owes, or null when it does not exist or
 * belongs to a different supplier (guards against deducting one supplier's
 * credit against another's delivery).
 */
function targetRemaining(targetType, targetId, supplierName) {
    if (targetType === 'resale') {
        const r = database_1.default.prepare('SELECT * FROM material_resales WHERE id = ? AND origin_factory = ?').get(targetId, supplierName);
        if (!r)
            return null;
        return resaleSupplierCost(r) - (r.supplier_paid ?? 0);
    }
    const i = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE id = ? AND supplier_name = ?').get(targetId, supplierName);
    if (!i)
        return null;
    return i.amount - (i.paid ?? 0);
}
function nextPaymentId() {
    const rows = database_1.default.prepare('SELECT id FROM supplier_payments').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/PAY-S(\d+)/i);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `PAY-S${max + 1}`;
}
function nextInvoiceId() {
    const rows = database_1.default.prepare('SELECT id FROM supplier_invoices').all();
    const max = rows.reduce((m, r) => {
        const match = r.id.match(/INV-S(\d+)/i);
        return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `INV-S${max + 1}`;
}
// ────────────────────────────────────────────────────────────────────────────
// Payments router — /api/supplier-payments
// ────────────────────────────────────────────────────────────────────────────
exports.supplierPaymentsRouter = (0, express_1.Router)();
/**
 * GET /api/supplier-payments — List payments with their allocations
 */
exports.supplierPaymentsRouter.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { supplierName, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM supplier_payments WHERE 1=1';
    const params = [];
    if (supplierName && typeof supplierName === 'string' && supplierName.trim()) {
        sql += ' AND supplier_name = ?';
        params.push(supplierName.trim());
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
      SELECT * FROM supplier_payment_allocations WHERE payment_id = ?
    `).all(p.id);
        const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
        return {
            id: p.id,
            date: p.date,
            supplierName: p.supplier_name,
            amount: p.amount,
            paymentType: p.payment_type ?? '',
            notes: p.notes ?? '',
            allocatedAmount,
            unallocatedAmount: p.amount - allocatedAmount,
            allocations: allocations.map(a => ({
                id: a.id,
                paymentId: a.payment_id,
                targetType: a.target_type,
                targetId: a.target_id,
                amount: a.amount
            })),
            createdAt: p.created_at,
            updatedAt: p.updated_at
        };
    });
    res.json({ success: true, data: payments });
}));
/**
 * GET /api/supplier-payments/next-id — Next sequential ID (PAY-S1, PAY-S2, ...)
 */
exports.supplierPaymentsRouter.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    res.json({ success: true, data: { nextId: nextPaymentId() } });
}));
/**
 * GET /api/supplier-payments/summary — Balance status for every supplier
 */
exports.supplierPaymentsRouter.get('/summary', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    // A supplier exists if goods were ever bought from it, money was ever paid
    // to it, or a manual invoice names it — same union trick the driver summary
    // uses, so a supplier holding only a prepayment still appears.
    const supplierRows = database_1.default.prepare(`
    SELECT origin_factory as name FROM material_resales WHERE origin_factory != ''
    UNION
    SELECT supplier_name as name FROM supplier_payments WHERE supplier_name != ''
    UNION
    SELECT supplier_name as name FROM supplier_invoices WHERE supplier_name != ''
  `).all();
    const summaries = supplierRows.map(({ name }) => {
        // 1. Goods bought from this supplier via resales
        const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE origin_factory = ?').all(name);
        let resaleOwed = 0;
        let resalePaid = 0;
        resales.forEach(r => {
            resaleOwed += resaleSupplierCost(r);
            resalePaid += (r.supplier_paid ?? 0);
        });
        // 2. Manual invoices
        const invoices = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE supplier_name = ?').all(name);
        let invoiceOwed = 0;
        let invoicePaid = 0;
        invoices.forEach(i => {
            invoiceOwed += i.amount;
            invoicePaid += (i.paid ?? 0);
        });
        // 3. Payments made to this supplier
        const payments = database_1.default.prepare('SELECT * FROM supplier_payments WHERE supplier_name = ?').all(name);
        const totalPaymentsGiven = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalOwed = resaleOwed + invoiceOwed;
        const totalAllocatedPaid = resalePaid + invoicePaid;
        // DRAWDOWN semantics: an advance is money sitting with the supplier until
        // the owner deducts it against a specific shipment. So the credit only
        // falls when he actually makes that deduction, and a shipment counts as
        // debt until it has been deducted for. A supplier can therefore show both
        // at once — credit still on account, and goods received but not yet drawn
        // down — which is the true position, not a contradiction.
        const outstandingDebt = Math.max(0, totalOwed - totalAllocatedPaid);
        const prepaidBalance = Math.max(0, totalPaymentsGiven - totalAllocatedPaid);
        const shipmentsCount = resales.length + invoices.length;
        const unpaidCount = resales.filter(r => (r.supplier_paid ?? 0) < resaleSupplierCost(r)).length +
            invoices.filter(i => (i.paid ?? 0) < i.amount).length;
        return {
            supplierName: name,
            totalOwed,
            totalPaymentsGiven,
            totalAllocatedPaid,
            outstandingDebt,
            prepaidBalance,
            shipmentsCount,
            unpaidCount
        };
    });
    res.json({ success: true, data: summaries });
}));
/**
 * GET /api/supplier-payments/statement/:supplierName — Full account statement
 */
exports.supplierPaymentsRouter.get('/statement/:supplierName', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const name = req.params.supplierName;
    const resales = database_1.default.prepare('SELECT * FROM material_resales WHERE origin_factory = ? ORDER BY date DESC').all(name);
    const invoices = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE supplier_name = ? ORDER BY date DESC').all(name);
    const payments = database_1.default.prepare('SELECT * FROM supplier_payments WHERE supplier_name = ? ORDER BY date DESC').all(name);
    const itemized = [
        ...resales.map(r => {
            const owed = resaleSupplierCost(r);
            return {
                type: 'resale',
                id: r.id,
                date: r.date,
                description: r.material_type ?? '',
                endClient: r.end_client ?? '',
                totalTonnage: r.total_tonnage,
                quantityUnit: r.quantity_unit ?? 'طن',
                owed,
                paid: r.supplier_paid ?? 0,
                remaining: owed - (r.supplier_paid ?? 0)
            };
        }),
        ...invoices.map(i => ({
            type: 'invoice',
            id: i.id,
            date: i.date,
            description: i.notes ?? '',
            endClient: '',
            totalTonnage: 0,
            quantityUnit: '',
            owed: i.amount,
            paid: i.paid ?? 0,
            remaining: i.amount - (i.paid ?? 0)
        }))
    ].sort((a, b) => b.date.localeCompare(a.date));
    const totalOwed = itemized.reduce((sum, item) => sum + item.owed, 0);
    const totalAllocatedPaid = itemized.reduce((sum, item) => sum + item.paid, 0);
    const totalPaymentsGiven = payments.reduce((sum, p) => sum + p.amount, 0);
    // Drawdown semantics — see the summary endpoint.
    const outstandingDebt = Math.max(0, totalOwed - totalAllocatedPaid);
    const prepaidBalance = Math.max(0, totalPaymentsGiven - totalAllocatedPaid);
    res.json({
        success: true,
        data: {
            supplierName: name,
            summary: {
                totalOwed,
                totalPaymentsGiven,
                totalAllocatedPaid,
                outstandingDebt,
                prepaidBalance
            },
            itemized,
            payments: payments.map(p => ({
                id: p.id,
                date: p.date,
                amount: p.amount,
                paymentType: p.payment_type ?? '',
                notes: p.notes ?? '',
                // How much of this payment is currently applied to shipments/trips.
                // The edit dialog reads it so correcting an unapplied advance does not
                // silently turn it into a settlement.
                allocatedAmount: database_1.default.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM supplier_payment_allocations WHERE payment_id = ?').get(p.id).total
            }))
        }
    });
}));
/**
 * POST /api/supplier-payments — Record a payment (prepayment or repayment)
 */
exports.supplierPaymentsRouter.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id: reqId, date, supplierName, amount, paymentType, notes, allocationMode } = req.body;
    if (!date || !supplierName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, supplierName, amount', 400, 'VALIDATION_ERROR');
    }
    const id = reqId || nextPaymentId();
    const executePaymentTx = database_1.default.transaction(() => {
        database_1.default.prepare(`
      INSERT INTO supplier_payments (id, date, supplier_name, amount, payment_type, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, supplierName, amount, paymentType || '', notes || '');
        let remainingToAllocate = amount;
        if (allocationMode === 'auto') {
            // Same routine the correction path uses, so the two cannot diverge.
            remainingToAllocate = allocateFifo(id, supplierName, remainingToAllocate);
        }
        // allocationMode 'none': the payment stays unallocated — a prepayment.
    });
    executePaymentTx();
    const created = database_1.default.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: created });
}));
/**
 * Settle a supplier's unpaid shipments and invoices, oldest first, writing
 * allocation rows and refreshing each target's paid cache.
 *
 * Shared by POST and PUT so a corrected payment settles by exactly the same
 * rule as the original. Returns what could not be placed, which stays on the
 * supplier's account as advance credit.
 */
function allocateFifo(paymentId, supplierName, amount) {
    const unpaidResales = database_1.default.prepare(`
    SELECT id, 'resale' as target_type, date, ${RESALE_SUPPLIER_COST_SQL} as owed, supplier_paid as paid
    FROM material_resales
    WHERE origin_factory = ? AND COALESCE(supplier_paid, 0) < ${RESALE_SUPPLIER_COST_SQL}
    ORDER BY date ASC
  `).all(supplierName);
    const unpaidInvoices = database_1.default.prepare(`
    SELECT id, 'invoice' as target_type, date, amount as owed, paid
    FROM supplier_invoices
    WHERE supplier_name = ? AND COALESCE(paid, 0) < amount
    ORDER BY date ASC
  `).all(supplierName);
    const combinedUnpaid = [...unpaidResales, ...unpaidInvoices].sort((a, b) => a.date.localeCompare(b.date));
    let remaining = amount;
    for (const item of combinedUnpaid) {
        if (remaining <= 0)
            break;
        const due = item.owed - (item.paid ?? 0);
        if (due <= 0)
            continue;
        const allocAmt = Math.min(due, remaining);
        database_1.default.prepare(`
      INSERT INTO supplier_payment_allocations (payment_id, target_type, target_id, amount)
      VALUES (?, ?, ?, ?)
    `).run(paymentId, item.target_type, item.id, allocAmt);
        syncTargetPaid(item.target_type, item.id);
        remaining -= allocAmt;
    }
    return remaining;
}
/**
 * PUT /api/supplier-payments/:id — Correct a payment entered wrongly
 *
 * Note this also undoes any manual deductions that were drawn from this
 * payment: those deductions spent money the corrected figure may no longer
 * contain, so they cannot be left standing. The shipments involved return to
 * owing and can be deducted for again from the corrected balance.
 */
exports.supplierPaymentsRouter.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const { date, supplierName, amount, paymentType, notes, allocationMode } = req.body;
    if (!date || !supplierName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, supplierName, amount', 400, 'VALIDATION_ERROR');
    }
    const updateTx = database_1.default.transaction(() => {
        const previous = database_1.default.prepare(`
      SELECT target_type, target_id FROM supplier_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        database_1.default.prepare('DELETE FROM supplier_payment_allocations WHERE payment_id = ?').run(paymentId);
        for (const alloc of previous) {
            syncTargetPaid(alloc.target_type, alloc.target_id);
        }
        database_1.default.prepare(`
      UPDATE supplier_payments
      SET date = ?, supplier_name = ?, amount = ?, payment_type = ?, notes = ?,
          updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, supplierName, amount, paymentType || '', notes || '', paymentId);
        // 'none' leaves it as advance credit the owner draws down by hand.
        if (allocationMode === 'auto') {
            allocateFifo(paymentId, supplierName, amount);
        }
    });
    updateTx();
    const updated = database_1.default.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(paymentId);
    res.json({ success: true, data: updated });
}));
/**
 * GET /api/supplier-payments/available/:supplierName — Advance still on
 * account: money paid to this supplier that has not been deducted yet.
 */
exports.supplierPaymentsRouter.get('/available/:supplierName', (0, error_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, data: { available: availableAdvance(req.params.supplierName) } });
}));
/**
 * POST /api/supplier-payments/deduct — Draw an amount off a supplier's
 * advance against ONE shipment or invoice.
 *
 * This is the manual drawdown: the operator decides which delivery the money
 * is being used for and how much. The amount is taken from the supplier's
 * oldest payments that still have room, so the receipt history stays in
 * order, and it is refused outright if it exceeds either the advance on
 * account or what that shipment still owes — money can never be deducted
 * twice or deducted from credit that does not exist.
 */
exports.supplierPaymentsRouter.post('/deduct', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { supplierName, targetType, targetId, amount } = req.body;
    if (!supplierName || !targetType || !targetId || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: supplierName, targetType, targetId, amount', 400, 'VALIDATION_ERROR');
    }
    if (targetType !== 'resale' && targetType !== 'invoice') {
        throw (0, error_handler_1.createApiError)("targetType must be 'resale' or 'invoice'", 400, 'VALIDATION_ERROR');
    }
    const available = availableAdvance(supplierName);
    if (amount > available) {
        throw (0, error_handler_1.createApiError)(`Deduction exceeds the advance on account (available: ${available})`, 400, 'INSUFFICIENT_ADVANCE');
    }
    const remaining = targetRemaining(targetType, targetId, supplierName);
    if (remaining === null) {
        throw (0, error_handler_1.createApiError)('Shipment or invoice not found for this supplier', 404, 'NOT_FOUND');
    }
    if (amount > remaining) {
        throw (0, error_handler_1.createApiError)(`Deduction exceeds what this shipment still owes (remaining: ${remaining})`, 400, 'EXCEEDS_REMAINING');
    }
    const deductTx = database_1.default.transaction(() => {
        // Draw from the oldest payments that still have unallocated room.
        const payments = database_1.default.prepare(`
      SELECT p.id, p.amount,
             COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.payment_id = p.id), 0) AS allocated
      FROM supplier_payments p
      WHERE p.supplier_name = ?
      ORDER BY p.date ASC, p.id ASC
    `).all(supplierName);
        let left = amount;
        for (const p of payments) {
            if (left <= 0)
                break;
            const room = p.amount - p.allocated;
            if (room <= 0)
                continue;
            const take = Math.min(room, left);
            database_1.default.prepare(`
        INSERT INTO supplier_payment_allocations (payment_id, target_type, target_id, amount)
        VALUES (?, ?, ?, ?)
      `).run(p.id, targetType, targetId, take);
            left -= take;
        }
        syncTargetPaid(targetType, targetId);
    });
    deductTx();
    res.json({
        success: true,
        data: {
            supplierName,
            targetType,
            targetId,
            deducted: amount,
            remainingAdvance: availableAdvance(supplierName),
            targetRemaining: targetRemaining(targetType, targetId, supplierName)
        }
    });
}));
/**
 * DELETE /api/supplier-payments/:id — Delete payment and revert allocations
 */
exports.supplierPaymentsRouter.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const paymentId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM supplier_payments WHERE id = ?').get(paymentId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Payment not found', 404, 'NOT_FOUND');
    const deleteTx = database_1.default.transaction(() => {
        const allocations = database_1.default.prepare(`
      SELECT target_type, target_id FROM supplier_payment_allocations WHERE payment_id = ?
    `).all(paymentId);
        database_1.default.prepare('DELETE FROM supplier_payment_allocations WHERE payment_id = ?').run(paymentId);
        database_1.default.prepare('DELETE FROM supplier_payments WHERE id = ?').run(paymentId);
        for (const alloc of allocations) {
            syncTargetPaid(alloc.target_type, alloc.target_id);
        }
    });
    deleteTx();
    res.json({ success: true, message: 'Supplier payment deleted and allocations reverted' });
}));
// ────────────────────────────────────────────────────────────────────────────
// Invoices router — /api/supplier-invoices
// ────────────────────────────────────────────────────────────────────────────
exports.supplierInvoicesRouter = (0, express_1.Router)();
/**
 * GET /api/supplier-invoices — List manual supplier debts
 */
exports.supplierInvoicesRouter.get('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { supplierName, dateStart, dateEnd } = req.query;
    let sql = 'SELECT * FROM supplier_invoices WHERE 1=1';
    const params = [];
    if (supplierName && typeof supplierName === 'string' && supplierName.trim()) {
        sql += ' AND supplier_name = ?';
        params.push(supplierName.trim());
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
    res.json({
        success: true,
        data: rows.map(i => ({
            id: i.id,
            date: i.date,
            supplierName: i.supplier_name,
            amount: i.amount,
            notes: i.notes ?? '',
            paid: i.paid ?? 0,
            remaining: i.amount - (i.paid ?? 0),
            createdAt: i.created_at,
            updatedAt: i.updated_at
        }))
    });
}));
/**
 * GET /api/supplier-invoices/next-id — Next sequential ID (INV-S1, ...)
 */
exports.supplierInvoicesRouter.get('/next-id', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    res.json({ success: true, data: { nextId: nextInvoiceId() } });
}));
/**
 * POST /api/supplier-invoices — Record goods received without payment (debt)
 */
exports.supplierInvoicesRouter.post('/', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { id: reqId, date, supplierName, amount, notes } = req.body;
    if (!date || !supplierName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, supplierName, amount', 400, 'VALIDATION_ERROR');
    }
    const id = reqId || nextInvoiceId();
    const existing = database_1.default.prepare('SELECT id FROM supplier_invoices WHERE id = ?').get(id);
    if (existing)
        throw (0, error_handler_1.createApiError)('Invoice ID already exists', 409, 'DUPLICATE_ID');
    database_1.default.prepare(`
    INSERT INTO supplier_invoices (id, date, supplier_name, amount, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, date, supplierName, amount, notes || '');
    const created = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: created });
}));
/**
 * DELETE /api/supplier-invoices/:id — Delete an invoice and its allocations
 */
exports.supplierInvoicesRouter.delete('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const invoiceId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(invoiceId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Invoice not found', 404, 'NOT_FOUND');
    const deleteTx = database_1.default.transaction(() => {
        // The allocations that settled this invoice die with it; the paying
        // payments simply become unallocated again (their money returns to the
        // supplier's net balance, which is recomputed live from the tables).
        database_1.default.prepare(`DELETE FROM supplier_payment_allocations WHERE target_type = 'invoice' AND target_id = ?`).run(invoiceId);
        database_1.default.prepare('DELETE FROM supplier_invoices WHERE id = ?').run(invoiceId);
    });
    deleteTx();
    res.json({ success: true, message: 'Supplier invoice deleted and allocations reverted' });
}));
/**
 * PUT /api/supplier-invoices/:id — Correct an invoice entered wrongly
 *
 * Deductions already applied to this invoice are kept whenever they are still
 * true: raising a mistyped 50,000 to 500,000 does not undo the 50,000 that was
 * genuinely paid against it. They are dropped only when they can no longer be
 * true — the invoice now belongs to a different supplier, or its amount fell
 * below what was already applied to it.
 */
exports.supplierInvoicesRouter.put('/:id', (0, error_handler_1.asyncHandler)(async (req, res) => {
    const invoiceId = req.params.id;
    const existing = database_1.default.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(invoiceId);
    if (!existing)
        throw (0, error_handler_1.createApiError)('Invoice not found', 404, 'NOT_FOUND');
    const { date, supplierName, amount, notes } = req.body;
    if (!date || !supplierName || !amount || amount <= 0) {
        throw (0, error_handler_1.createApiError)('Missing required fields: date, supplierName, amount', 400, 'VALIDATION_ERROR');
    }
    const allocated = database_1.default.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM supplier_payment_allocations WHERE target_type = 'invoice' AND target_id = ?`).get(invoiceId).total;
    const supplierChanged = supplierName !== existing.supplier_name;
    const shrankBelowPaid = amount < allocated;
    const dropAllocations = supplierChanged || shrankBelowPaid;
    const updateTx = database_1.default.transaction(() => {
        if (dropAllocations) {
            database_1.default.prepare(`DELETE FROM supplier_payment_allocations WHERE target_type = 'invoice' AND target_id = ?`).run(invoiceId);
        }
        database_1.default.prepare(`
      UPDATE supplier_invoices
      SET date = ?, supplier_name = ?, amount = ?, notes = ?, paid = ?, updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, supplierName, amount, notes || '', dropAllocations ? 0 : allocated, invoiceId);
    });
    updateTx();
    res.json({
        success: true,
        data: database_1.default.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(invoiceId),
        meta: { allocationsReverted: dropAllocations }
    });
}));
