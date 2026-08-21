/**
 * Client Payments & Ledger — CRUD API Routes
 * Handles all /api/client-payments/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { queueSync } from '../sync/replicator';

const router = Router();

/**
 * Helper: Recalculate trip/resale client_paid from allocations table
 */
function syncTripClientPaid(tripType: 'transport' | 'resale', tripId: string) {
  const table = tripType === 'transport' ? 'client_trips' : 'material_resales';
  const sumRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_allocated
    FROM client_payment_allocations
    WHERE trip_type = ? AND trip_id = ?
  `).get(tripType, tripId) as { total_allocated: number };

  db.prepare(`
    UPDATE ${table}
    SET client_paid = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sumRow.total_allocated, tripId);
}

/**
 * GET /api/client-payments — List all client payments with allocations
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { clientName, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM client_payments WHERE 1=1';
  const params: any[] = [];

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

  const rows = db.prepare(sql).all(...params) as any[];

  const payments = rows.map(p => {
    const allocations = db.prepare(`
      SELECT * FROM client_payment_allocations WHERE payment_id = ?
    `).all(p.id) as any[];

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
router.get('/next-id', asyncHandler(async (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id FROM client_payments').all() as { id: string }[];
  const max = rows.reduce((m, r) => {
    const match = r.id.match(/PAY-C(\d+)/i);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  res.json({ success: true, data: { nextId: `PAY-C${max + 1}` } });
}));

/**
 * GET /api/client-payments/summary — Summary statistics for all clients
 */
router.get('/summary', asyncHandler(async (_req: Request, res: Response) => {
  // Collect all distinct client names from trips, resales, and payments
  const clientRows = db.prepare(`
    SELECT client_name as name FROM client_trips WHERE client_name != ''
    UNION
    SELECT end_client as name FROM material_resales WHERE end_client != ''
    UNION
    SELECT client_name as name FROM client_payments WHERE client_name != ''
  `).all() as { name: string }[];

  const clientSummaries = clientRows.map(({ name }) => {
    // 1. Transport Trips for client
    const trips = db.prepare('SELECT * FROM client_trips WHERE client_name = ?').all(name) as any[];
    let transportInvoiced = 0;
    let transportPaid = 0;
    trips.forEach(t => {
      const fee = t.truck_cost + t.driver_cut + t.company_profit;
      transportInvoiced += fee;
      transportPaid += (t.client_paid ?? 0);
    });

    // 2. Material Resales for client
    const resales = db.prepare('SELECT * FROM material_resales WHERE end_client = ?').all(name) as any[];
    let resaleInvoiced = 0;
    let resalePaid = 0;
    resales.forEach(r => {
      resaleInvoiced += r.client_selling_price;
      resalePaid += (r.client_paid ?? 0);
    });

    const totalInvoiced = transportInvoiced + resaleInvoiced;

    // 3. Client Payments recorded
    const payments = db.prepare('SELECT * FROM client_payments WHERE client_name = ?').all(name) as any[];
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + p.amount, 0);

    // Allocations sum
    const totalAllocatedPaid = transportPaid + resalePaid;
    const unallocatedCredit = Math.max(0, totalPaymentsReceived - totalAllocatedPaid);
    const outstandingReceivable = Math.max(0, totalInvoiced - totalAllocatedPaid);

    const totalTripsCount = trips.length + resales.length;
    const unpaidTripsCount = trips.filter(t => (t.client_paid ?? 0) < (t.truck_cost + t.driver_cut + t.company_profit)).length +
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
router.get('/statement/:clientName', asyncHandler(async (req: Request, res: Response) => {
  const name = req.params.clientName;

  const trips = db.prepare('SELECT * FROM client_trips WHERE client_name = ? ORDER BY date DESC').all(name) as any[];
  const resales = db.prepare('SELECT * FROM material_resales WHERE end_client = ? ORDER BY date DESC').all(name) as any[];
  const payments = db.prepare('SELECT * FROM client_payments WHERE client_name = ? ORDER BY date DESC').all(name) as any[];

  const itemizedTrips = [
    ...trips.map(t => {
      const fee = t.truck_cost + t.driver_cut + t.company_profit;
      return {
        type: 'transport' as const,
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
      type: 'resale' as const,
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
        allocatedAmount: (db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM client_payment_allocations WHERE payment_id = ?').get(p.id) as any).total
      }))
    }
  });
}));

/**
 * POST /api/client-payments — Record a client payment & handle allocation
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id: reqId, date, clientName, amount, paymentMethod, notes, allocationMode, allocations } = req.body;

  if (!date || !clientName || !amount || amount <= 0) {
    throw createApiError('Missing required fields: date, clientName, amount', 400, 'VALIDATION_ERROR');
  }

  // Generate ID if not provided
  let id = reqId;
  if (!id) {
    const rows = db.prepare('SELECT id FROM client_payments').all() as { id: string }[];
    const max = rows.reduce((m, r) => {
      const match = r.id.match(/PAY-C(\d+)/i);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    id = `PAY-C${max + 1}`;
  }

  // Transaction for strict atomic execution
  const executePaymentTx = db.transaction(() => {
    // Insert into client_payments
    db.prepare(`
      INSERT INTO client_payments (id, date, client_name, amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, clientName, amount, paymentMethod || 'Cash', notes || '');

    let remainingToAllocate = amount;

    if (allocationMode === 'manual' && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (!alloc.tripId || !alloc.tripType || alloc.amount <= 0) continue;
        const allocAmt = Math.min(alloc.amount, remainingToAllocate);
        if (allocAmt <= 0) break;

        db.prepare(`
          INSERT INTO client_payment_allocations (payment_id, trip_type, trip_id, amount)
          VALUES (?, ?, ?, ?)
        `).run(id, alloc.tripType, alloc.tripId, allocAmt);

        syncTripClientPaid(alloc.tripType, alloc.tripId);
        remainingToAllocate -= allocAmt;
      }
    } else if (allocationMode === 'auto') {
      // Same routine the correction path uses, so the two cannot diverge.
      remainingToAllocate = allocateFifo(id, clientName, remainingToAllocate);
    }
  });

  executePaymentTx();

  const created = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(id);
  queueSync('client_payments', id, 'upsert', created);

  res.status(201).json({ success: true, data: created });
}));

/**
 * DELETE /api/client-payments/:id — Delete client payment and rollback allocations
 */
/**
 * Spread an amount over a client's unpaid trips and resales, oldest first,
 * writing allocation rows and refreshing each target's paid cache.
 *
 * Shared by POST and PUT so a corrected receipt is allocated by exactly the
 * same rule as the original. Returns what could not be placed, which stays
 * on the client's account as unallocated credit.
 */
function allocateFifo(paymentId: string, clientName: string, amount: number): number {
  const trips = db.prepare(`
    SELECT id, 'transport' as trip_type, date, (truck_cost + driver_cut + company_profit) as total_fee, client_paid
    FROM client_trips
    WHERE client_name = ? AND client_paid < (truck_cost + driver_cut + company_profit)
    ORDER BY date ASC
  `).all(clientName) as any[];

  const resales = db.prepare(`
    SELECT id, 'resale' as trip_type, date, client_selling_price as total_fee, client_paid
    FROM material_resales
    WHERE end_client = ? AND client_paid < client_selling_price
    ORDER BY date ASC
  `).all(clientName) as any[];

  const combinedUnpaid = [...trips, ...resales].sort((a, b) => a.date.localeCompare(b.date));

  let remaining = amount;
  for (const item of combinedUnpaid) {
    if (remaining <= 0) break;

    const due = item.total_fee - (item.client_paid ?? 0);
    if (due <= 0) continue;

    const allocAmt = Math.min(due, remaining);

    db.prepare(`
      INSERT INTO client_payment_allocations (payment_id, trip_type, trip_id, amount)
      VALUES (?, ?, ?, ?)
    `).run(paymentId, item.trip_type, item.id, allocAmt);

    syncTripClientPaid(item.trip_type, item.id);
    remaining -= allocAmt;
  }

  return remaining;
}

/**
 * PUT /api/client-payments/:id — Correct a receipt entered wrongly
 *
 * The old allocations are removed and every trip they touched recalculated
 * before the corrected amount is re-applied, so lowering an amount correctly
 * returns trips to unpaid rather than leaving them settled by money that is
 * no longer there.
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const paymentId = req.params.id;

  const existing = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId) as any;
  if (!existing) throw createApiError('Payment not found', 404, 'NOT_FOUND');

  const { date, clientName, amount, paymentMethod, notes, allocationMode } = req.body;

  if (!date || !clientName || !amount || amount <= 0) {
    throw createApiError('Missing required fields: date, clientName, amount', 400, 'VALIDATION_ERROR');
  }

  const updateTx = db.transaction(() => {
    const previous = db.prepare(`
      SELECT trip_type, trip_id FROM client_payment_allocations WHERE payment_id = ?
    `).all(paymentId) as any[];

    db.prepare('DELETE FROM client_payment_allocations WHERE payment_id = ?').run(paymentId);
    for (const alloc of previous) {
      syncTripClientPaid(alloc.trip_type, alloc.trip_id);
    }

    db.prepare(`
      UPDATE client_payments
      SET date = ?, client_name = ?, amount = ?, payment_method = ?, notes = ?,
          updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, clientName, amount, paymentMethod || 'Cash', notes || '', paymentId);

    // 'none' leaves the money unallocated — a deposit, same as on create.
    if (allocationMode === 'auto') {
      allocateFifo(paymentId, clientName, amount);
    }
  });

  updateTx();

  const updated = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
  res.json({ success: true, data: updated });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const paymentId = req.params.id;

  const existing = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
  if (!existing) throw createApiError('Payment not found', 404, 'NOT_FOUND');

  const deleteTx = db.transaction(() => {
    // Find all allocations to sync affected trips afterwards
    const allocations = db.prepare(`
      SELECT trip_type, trip_id FROM client_payment_allocations WHERE payment_id = ?
    `).all(paymentId) as any[];

    // Delete allocations
    db.prepare('DELETE FROM client_payment_allocations WHERE payment_id = ?').run(paymentId);

    // Delete payment
    db.prepare('DELETE FROM client_payments WHERE id = ?').run(paymentId);

    // Sync affected trips
    for (const alloc of allocations) {
      syncTripClientPaid(alloc.trip_type, alloc.trip_id);
    }
  });

  deleteTx();
  queueSync('client_payments', paymentId, 'delete', null);

  res.json({ success: true, message: 'Payment deleted and allocations reverted' });
}));

export default router;
