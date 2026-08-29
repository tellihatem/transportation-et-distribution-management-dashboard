/**
 * Driver Payments & Ledger — CRUD API Routes
 * Handles all /api/driver-payments/* endpoints
 */

import { Router, Request, Response } from 'express';
import db from '../database';
import { asyncHandler, createApiError } from '../middleware/error-handler';
import { syncTripDriverPaid, allocateDriverPayment, RESALE_DRIVER_WAGE_SQL, applyDriverAdvance, manualAllocationError, MONEY_EPSILON } from '../ledgers';

// NOTE deliberately no queueSync here: the payment/allocation tables are
// local-only (no Supabase mirror). Queuing deletes for them errors into
// sync_queue and retries forever — see server/routes/suppliers.ts for the
// same decision documented on the supplier ledger.
const router = Router();

/**
 * What a driver is owed for one resale.
 *
 * driver_cost is the wage for a SINGLE trip; trip_count says how many trips
 * the delivery actually took. Kept in one place because the same figure is
 * needed by the summary, the statement and the FIFO allocation query, and
 * they must never disagree about what is owed.
 */
function resaleDriverWage(row: { driver_cost: number; trip_count?: number | null }): number {
  return Math.max(1, row.trip_count ?? 1) * row.driver_cost;
}

/** SQL equivalent of resaleDriverWage(), for queries that cannot use it. */

/**
 * GET /api/driver-payments — List all driver payments with allocations
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { driverName, dateStart, dateEnd } = req.query;

  let sql = 'SELECT * FROM driver_payments WHERE 1=1';
  const params: any[] = [];

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

  const rows = db.prepare(sql).all(...params) as any[];

  const payments = rows.map(p => {
    const allocations = db.prepare(`
      SELECT * FROM driver_payment_allocations WHERE payment_id = ?
    `).all(p.id) as any[];

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
router.get('/next-id', asyncHandler(async (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT id FROM driver_payments').all() as { id: string }[];
  const max = rows.reduce((m, r) => {
    const match = r.id.match(/PAY-D(\d+)/i);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  res.json({ success: true, data: { nextId: `PAY-D${max + 1}` } });
}));

/**
 * GET /api/driver-payments/summary — Summary statistics for all drivers
 */
router.get('/summary', asyncHandler(async (_req: Request, res: Response) => {
  // Aggregate per table instead of three full scans per driver — same
  // rationale as the client summary: this refires on every write and runs on
  // the Electron main thread.
  const tripAgg = new Map<string, any>();
  for (const r of db.prepare(`
    SELECT driver_name as name,
           SUM(driver_cut) as earned,
           SUM(COALESCE(driver_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(driver_paid, 0) < driver_cut - ${MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM client_trips WHERE driver_name != '' GROUP BY driver_name
  `).all() as any[]) tripAgg.set(r.name, r);

  const resaleAgg = new Map<string, any>();
  for (const r of db.prepare(`
    SELECT driver_name as name,
           SUM(${RESALE_DRIVER_WAGE_SQL}) as earned,
           SUM(COALESCE(driver_paid, 0)) as paid,
           COUNT(*) as cnt,
           SUM(CASE WHEN COALESCE(driver_paid, 0) < ${RESALE_DRIVER_WAGE_SQL} - ${MONEY_EPSILON} THEN 1 ELSE 0 END) as unpaid
    FROM material_resales WHERE driver_name != '' GROUP BY driver_name
  `).all() as any[]) resaleAgg.set(r.name, r);

  const payAgg = new Map<string, number>();
  for (const r of db.prepare(`
    SELECT driver_name as name, SUM(amount) as total
    FROM driver_payments WHERE driver_name != '' GROUP BY driver_name
  `).all() as any[]) payAgg.set(r.name, r.total);

  const names = new Set<string>([...tripAgg.keys(), ...resaleAgg.keys(), ...payAgg.keys()]);

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
router.get('/statement/:driverName', asyncHandler(async (req: Request, res: Response) => {
  const name = req.params.driverName;

  const trips = db.prepare('SELECT * FROM client_trips WHERE driver_name = ? ORDER BY date DESC').all(name) as any[];
  const resales = db.prepare('SELECT * FROM material_resales WHERE driver_name = ? ORDER BY date DESC').all(name) as any[];
  const payments = db.prepare('SELECT * FROM driver_payments WHERE driver_name = ? ORDER BY date DESC').all(name) as any[];

  const itemizedTrips = [
    ...trips.map(t => ({
      type: 'transport' as const,
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
      type: 'resale' as const,
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
        allocatedAmount: (db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM driver_payment_allocations WHERE payment_id = ?').get(p.id) as any).total
      }))
    }
  });
}));

/**
 * POST /api/driver-payments — Record a driver payout & handle allocation
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id: reqId, date, driverName, amount, paymentType, notes, allocationMode, allocations } = req.body;

  if (!date || !driverName || !amount || amount <= 0) {
    throw createApiError('Missing required fields: date, driverName, amount', 400, 'VALIDATION_ERROR');
  }

  let id = reqId;
  if (!id) {
    const rows = db.prepare('SELECT id FROM driver_payments').all() as { id: string }[];
    const max = rows.reduce((m, r) => {
      const match = r.id.match(/PAY-D(\d+)/i);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    id = `PAY-D${max + 1}`;
  }

  const executePaymentTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO driver_payments (id, date, driver_name, amount, payment_type, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, date, driverName, amount, paymentType || 'Settlement', notes || '');

    let remainingToAllocate = amount;

    if (allocationMode === 'manual' && Array.isArray(allocations)) {
      for (const alloc of allocations) {
        if (!alloc.tripId || !alloc.tripType || alloc.amount <= 0) continue;
        const allocAmt = Math.min(alloc.amount, remainingToAllocate);
        if (allocAmt <= 0) break;

        // A bad manual row must fail loudly now, not poison the ledger until
        // the next work edit tears down the whole row's allocations.
        const problem = manualAllocationError('driver', driverName, alloc.tripType, alloc.tripId, allocAmt);
        if (problem) {
          throw createApiError(`Invalid allocation: ${problem}`, 400, 'VALIDATION_ERROR');
        }

        db.prepare(`
          INSERT INTO driver_payment_allocations (payment_id, trip_type, trip_id, amount)
          VALUES (?, ?, ?, ?)
        `).run(id, alloc.tripType, alloc.tripId, allocAmt);

        syncTripDriverPaid(alloc.tripType, alloc.tripId);
        remainingToAllocate -= allocAmt;
      }
    } else if (allocationMode === 'auto') {
      // Same routine the correction path uses, so the two cannot diverge.
      remainingToAllocate = allocateDriverPayment(id, driverName, remainingToAllocate);
    }
  });

  executePaymentTx();

  const created = db.prepare('SELECT * FROM driver_payments WHERE id = ?').get(id);

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
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const paymentId = req.params.id;

  const existing = db.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId) as any;
  if (!existing) throw createApiError('Payment not found', 404, 'NOT_FOUND');

  const { date, driverName, amount, paymentType, notes, allocationMode, allocations } = req.body;

  if (!date || !driverName || !amount || amount <= 0) {
    throw createApiError('Missing required fields: date, driverName, amount', 400, 'VALIDATION_ERROR');
  }

  const updateTx = db.transaction(() => {
    // Remember what the old allocations touched so those trips can be
    // recalculated even if the corrected payment no longer reaches them.
    const previous = db.prepare(`
      SELECT trip_type, trip_id FROM driver_payment_allocations WHERE payment_id = ?
    `).all(paymentId) as any[];

    db.prepare('DELETE FROM driver_payment_allocations WHERE payment_id = ?').run(paymentId);
    for (const alloc of previous) {
      syncTripDriverPaid(alloc.trip_type, alloc.trip_id);
    }

    db.prepare(`
      UPDATE driver_payments
      SET date = ?, driver_name = ?, amount = ?, payment_type = ?, notes = ?,
          updated_at = datetime('now'), synced_at = NULL
      WHERE id = ?
    `).run(date, driverName, amount, paymentType || 'Settlement', notes || '', paymentId);

    // 'none' leaves the money unallocated — an advance, same as on create.
    if (allocationMode === 'auto') {
      allocateDriverPayment(paymentId, driverName, amount);
    } else if (allocationMode === 'manual' && Array.isArray(allocations)) {
      let remainingToAllocate = amount;
      for (const alloc of allocations) {
        if (!alloc.tripId || !alloc.tripType || alloc.amount <= 0) continue;
        const allocAmt = Math.min(alloc.amount, remainingToAllocate);
        if (allocAmt <= 0) break;
        const problem = manualAllocationError('driver', driverName, alloc.tripType, alloc.tripId, allocAmt);
        if (problem) throw createApiError(`Invalid allocation: ${problem}`, 400, 'VALIDATION_ERROR');
        db.prepare(`INSERT INTO driver_payment_allocations (payment_id, trip_type, trip_id, amount) VALUES (?, ?, ?, ?)`)
          .run(paymentId, alloc.tripType, alloc.tripId, allocAmt);
        syncTripDriverPaid(alloc.tripType, alloc.tripId);
        remainingToAllocate -= allocAmt;
      }
    }
  });

  updateTx();

  applyDriverAdvance(existing.driver_name);
  if (driverName !== existing.driver_name) applyDriverAdvance(driverName);

  const updated = db.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId);
  res.json({ success: true, data: updated });
}));

/**
 * DELETE /api/driver-payments/:id — Delete driver payment and rollback allocations
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const paymentId = req.params.id;

  const existing = db.prepare('SELECT * FROM driver_payments WHERE id = ?').get(paymentId);
  if (!existing) throw createApiError('Payment not found', 404, 'NOT_FOUND');

  const deleteTx = db.transaction(() => {
    const allocations = db.prepare(`
      SELECT trip_type, trip_id FROM driver_payment_allocations WHERE payment_id = ?
    `).all(paymentId) as any[];

    db.prepare('DELETE FROM driver_payment_allocations WHERE payment_id = ?').run(paymentId);
    db.prepare('DELETE FROM driver_payments WHERE id = ?').run(paymentId);

    for (const alloc of allocations) {
      syncTripDriverPaid(alloc.trip_type, alloc.trip_id);
    }
  });

  deleteTx();

  // Same sweep as on the client side: freed wages resettle from any other
  // credit the driver still holds.
  applyDriverAdvance((existing as any).driver_name);


  res.json({ success: true, message: 'Driver payout deleted and allocations reverted' });
}));

export default router;
