/**
 * Client Payments & Ledger — CRUD API Routes
 * Handles all /api/client-payments/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { syncTripClientPaid, allocateClientPayment, applyClientCredit, applyManualAllocations, MONEY_EPSILON } from '../ledgers';
import { TRIP_CLIENT_FEE_SQL } from '../trip-math';
import { tripClientFee } from '../trip-math';

// NOTE deliberately no queueSync here: the payment/allocation tables are
// local-only (no Supabase mirror). Queuing deletes for them errors into
// sync_queue and retries forever — see server/routes/suppliers.ts for the
// same decision documented on the supplier ledger.
const router = Router();

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
  // One aggregate per table instead of three full scans per client. This
  // endpoint refires after every write (refreshAllData), and the server
  // shares the Electron main thread — per-party loops here were the largest
  // single source of the UI "freezing" as the day's data grew.
  const tripAgg = new Map<string, any>();
  for (const r of db.prepare(`
    SELECT client_name as name,
           SUM(${TRIP_CLIENT_FEE_SQL}) as invoiced,
           SUM(COALESCE(client_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(client_paid, 0) < ${TRIP_CLIENT_FEE_SQL} - ${MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM client_trips WHERE client_name != '' GROUP BY client_name
  `).all() as any[]) tripAgg.set(r.name, r);

  const resaleAgg = new Map<string, any>();
  for (const r of db.prepare(`
    SELECT end_client as name,
           SUM(client_selling_price) as invoiced,
           SUM(COALESCE(client_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(client_paid, 0) < client_selling_price - ${MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM material_resales WHERE end_client != '' GROUP BY end_client
  `).all() as any[]) resaleAgg.set(r.name, r);

  const payAgg = new Map<string, number>();
  for (const r of db.prepare(`
    SELECT client_name as name, SUM(amount) as total
    FROM client_payments WHERE client_name != '' GROUP BY client_name
  `).all() as any[]) payAgg.set(r.name, r.total);

  const names = new Set<string>([...tripAgg.keys(), ...resaleAgg.keys(), ...payAgg.keys()]);

  const clientSummaries = [...names].map(name => {
    const t = tripAgg.get(name);
    const r = resaleAgg.get(name);
    const totalInvoiced = (t?.invoiced ?? 0) + (r?.invoiced ?? 0);
    const totalAllocatedPaid = (t?.paid ?? 0) + (r?.paid ?? 0);
    const totalPaymentsReceived = payAgg.get(name) ?? 0;
    const unallocatedCredit = Math.max(0, totalPaymentsReceived - totalAllocatedPaid);
    const outstandingReceivable = Math.max(0, totalInvoiced - totalAllocatedPaid);

    return {
      clientName: name,
      totalInvoiced,
      totalPaymentsReceived,
      totalAllocatedPaid,
      outstandingReceivable,
      unallocatedCredit,
      totalTripsCount: (t?.cnt ?? 0) + (r?.cnt ?? 0),
      unpaidTripsCount: (t?.unpaid ?? 0) + (r?.unpaid ?? 0),
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
      const fee = tripClientFee({ truckCost: t.truck_cost });
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
      try {
        remainingToAllocate = applyManualAllocations('client', id, clientName, remainingToAllocate, allocations);
      } catch (err: any) {
        throw createApiError(err.message, 400, 'VALIDATION_ERROR');
      }
    } else if (allocationMode === 'auto') {
      // Same routine the correction path uses, so the two cannot diverge.
      remainingToAllocate = allocateClientPayment(id, clientName, remainingToAllocate);
    }
  });

  executePaymentTx();

  const created = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(id);

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
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const paymentId = req.params.id;

  const existing = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId) as any;
  if (!existing) throw createApiError('Payment not found', 404, 'NOT_FOUND');

  const { date, clientName, amount, paymentMethod, notes, allocationMode, allocations } = req.body;

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
      allocateClientPayment(paymentId, clientName, amount);
    } else if (allocationMode === 'manual' && Array.isArray(allocations)) {
      // Same rules as POST — an edited receipt may keep hand-placed rows
      // rather than silently converting them into an advance.
      try {
        applyManualAllocations('client', paymentId, clientName, amount, allocations);
      } catch (err: any) {
        throw createApiError(err.message, 400, 'VALIDATION_ERROR');
      }
    }
  });

  updateTx();

  // Work the old allocations were covering may be unpaid again, and if the
  // payment moved to another client, both parties' credit must resettle.
  applyClientCredit(existing.client_name);
  if (clientName !== existing.client_name) applyClientCredit(clientName);

  const updated = db.prepare('SELECT * FROM client_payments WHERE id = ?').get(paymentId);
  res.json({ success: true, data: updated });
}));

/**
 * DELETE /api/client-payments/:id — Delete client payment and rollback allocations
 */
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

  // The trips this payment covered are unpaid again. If the client holds any
  // other unapplied credit, it belongs on them now — the same sweep every
  // work-side write performs.
  applyClientCredit((existing as any).client_name);


  res.json({ success: true, message: 'Payment deleted and allocations reverted' });
}));

export default router;
