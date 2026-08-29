/**
 * Client and driver ledger allocation — one home for the FIFO rules.
 *
 * Money and work arrive in either order. A payment recorded against existing
 * unpaid work is applied when it is recorded; money paid before the work
 * exists (an advance, عربون / سلفة) has nothing to settle yet and waits as
 * credit. `applyClientCredit` / `applyDriverAdvance` are what make the second
 * case behave like the first: whenever work appears, changes or disappears,
 * the routes call them and any credit the party is holding flows onto the
 * oldest unsettled work.
 *
 * Supplier advances deliberately do NOT work this way — the owner draws them
 * down per delivery by hand, from the supplier tab. See server/routes/suppliers.ts.
 */

import db from './database';
import { TRIP_CLIENT_FEE_SQL, tripClientFee } from './trip-math';

/** Per-trip driver wage: the resale table stores it per trip, not per deal. */
export const RESALE_DRIVER_WAGE_SQL = 'MAX(1, COALESCE(trip_count, 1)) * driver_cost';

export type TripType = 'transport' | 'resale';

/**
 * Money tolerance. Prices are unit × quantity with REAL quantities, so totals
 * can carry float dust (…000000003). A strict `paid < fee` comparison would
 * keep an exactly-paid invoice "unpaid" forever and make every sweep insert
 * sub-centime allocation rows. Anything within half a centime is settled.
 */
export const MONEY_EPSILON = 0.005;

/** Recalculate a trip/resale's client_paid cache from the allocation rows. */
export function syncTripClientPaid(tripType: TripType, tripId: string) {
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

/** Recalculate a trip/resale's driver_paid cache from the allocation rows. */
export function syncTripDriverPaid(tripType: TripType, tripId: string) {
  const table = tripType === 'transport' ? 'client_trips' : 'material_resales';
  const sumRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_allocated
    FROM driver_payment_allocations
    WHERE trip_type = ? AND trip_id = ?
  `).get(tripType, tripId) as { total_allocated: number };

  db.prepare(`
    UPDATE ${table}
    SET driver_paid = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sumRow.total_allocated, tripId);
}

/** Work this client still owes money on, oldest first. */
function unpaidClientWork(clientName: string): any[] {
  const trips = db.prepare(`
    SELECT id, 'transport' as trip_type, date, ${TRIP_CLIENT_FEE_SQL} as total_fee, client_paid as paid
    FROM client_trips
    WHERE client_name = ? AND client_paid < ${TRIP_CLIENT_FEE_SQL} - ${MONEY_EPSILON}
    ORDER BY date ASC
  `).all(clientName) as any[];

  const resales = db.prepare(`
    SELECT id, 'resale' as trip_type, date, client_selling_price as total_fee, client_paid as paid
    FROM material_resales
    WHERE end_client = ? AND client_paid < client_selling_price - ${MONEY_EPSILON}
    ORDER BY date ASC
  `).all(clientName) as any[];

  return [...trips, ...resales].sort((a, b) => a.date.localeCompare(b.date));
}

/** Work this driver is still owed wages on, oldest first. */
function unpaidDriverWork(driverName: string): any[] {
  const trips = db.prepare(`
    SELECT id, 'transport' as trip_type, date, driver_cut as total_fee, driver_paid as paid
    FROM client_trips
    WHERE driver_name = ? AND driver_paid < driver_cut - ${MONEY_EPSILON}
    ORDER BY date ASC
  `).all(driverName) as any[];

  const resales = db.prepare(`
    SELECT id, 'resale' as trip_type, date, ${RESALE_DRIVER_WAGE_SQL} as total_fee, driver_paid as paid
    FROM material_resales
    WHERE driver_name = ? AND driver_paid < ${RESALE_DRIVER_WAGE_SQL} - ${MONEY_EPSILON}
    ORDER BY date ASC
  `).all(driverName) as any[];

  return [...trips, ...resales].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Spread `amount` from one payment across that party's unsettled work,
 * oldest first. Returns whatever could not be placed — the party's credit.
 */
export function allocateClientPayment(paymentId: string, clientName: string, amount: number): number {
  let remaining = amount;
  for (const item of unpaidClientWork(clientName)) {
    if (remaining <= 0) break;
    const due = item.total_fee - (item.paid ?? 0);
    if (due <= MONEY_EPSILON) continue;
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

export function allocateDriverPayment(paymentId: string, driverName: string, amount: number): number {
  let remaining = amount;
  for (const item of unpaidDriverWork(driverName)) {
    if (remaining <= 0) break;
    const due = item.total_fee - (item.paid ?? 0);
    if (due <= MONEY_EPSILON) continue;
    const allocAmt = Math.min(due, remaining);
    db.prepare(`
      INSERT INTO driver_payment_allocations (payment_id, trip_type, trip_id, amount)
      VALUES (?, ?, ?, ?)
    `).run(paymentId, item.trip_type, item.id, allocAmt);
    syncTripDriverPaid(item.trip_type, item.id);
    remaining -= allocAmt;
  }
  return remaining;
}

/** The part of each payment that is not yet applied to any work, oldest first. */
function unappliedPayments(table: string, allocTable: string, nameColumn: string, name: string): any[] {
  return db.prepare(`
    SELECT p.id, p.amount - COALESCE((
      SELECT SUM(a.amount) FROM ${allocTable} a WHERE a.payment_id = p.id
    ), 0) AS unapplied
    FROM ${table} p
    WHERE p.${nameColumn} = ?
    ORDER BY p.date ASC, p.id ASC
  `).all(name).filter((p: any) => p.unapplied > MONEY_EPSILON) as any[];
}

/**
 * Settle this client's outstanding work with any credit they are holding.
 *
 * Called whenever their work changes, so an advance paid before the trip
 * existed still lands on it. Doing nothing when there is no credit or no
 * unpaid work makes this safe to call on every write.
 */
export function applyClientCredit(clientName: string) {
  if (!clientName) return;
  for (const p of unappliedPayments('client_payments', 'client_payment_allocations', 'client_name', clientName)) {
    allocateClientPayment(p.id, clientName, p.unapplied);
  }
}

/** The driver-side twin: a standing سلفة covers wages earned after it. */
export function applyDriverAdvance(driverName: string) {
  if (!driverName) return;
  for (const p of unappliedPayments('driver_payments', 'driver_payment_allocations', 'driver_name', driverName)) {
    allocateDriverPayment(p.id, driverName, p.unapplied);
  }
}

/**
 * Drop allocations that a change to the work itself has invalidated: the trip
 * moved to another client/driver, or its total fell below what was already
 * applied to it. The money returns to the party as credit, and the sweep that
 * follows places whatever still fits.
 */
export function releaseStaleAllocations(tripType: TripType, tripId: string) {
  const table = tripType === 'transport' ? 'client_trips' : 'material_resales';
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(tripId) as any;
  if (!row) return;

  const clientFee = tripType === 'transport'
    ? tripClientFee({ truckCost: row.truck_cost })
    : (row.client_selling_price ?? 0);
  const driverFee = tripType === 'transport'
    ? (row.driver_cut ?? 0)
    : Math.max(1, row.trip_count ?? 1) * (row.driver_cost ?? 0);

  const clientAllocs = db.prepare(`
    SELECT a.id, p.client_name FROM client_payment_allocations a
    JOIN client_payments p ON p.id = a.payment_id
    WHERE a.trip_type = ? AND a.trip_id = ?
  `).all(tripType, tripId) as any[];
  const currentClient = tripType === 'transport' ? row.client_name : row.end_client;
  const clientTotal = clientAllocs.length
    ? (db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM client_payment_allocations WHERE trip_type = ? AND trip_id = ?`)
        .get(tripType, tripId) as any).t
    : 0;
  if (clientAllocs.some(a => a.client_name !== currentClient) || clientTotal > clientFee) {
    db.prepare('DELETE FROM client_payment_allocations WHERE trip_type = ? AND trip_id = ?').run(tripType, tripId);
    syncTripClientPaid(tripType, tripId);
  }

  const driverAllocs = db.prepare(`
    SELECT a.id, p.driver_name FROM driver_payment_allocations a
    JOIN driver_payments p ON p.id = a.payment_id
    WHERE a.trip_type = ? AND a.trip_id = ?
  `).all(tripType, tripId) as any[];
  const driverTotal = driverAllocs.length
    ? (db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM driver_payment_allocations WHERE trip_type = ? AND trip_id = ?`)
        .get(tripType, tripId) as any).t
    : 0;
  if (driverAllocs.some(a => a.driver_name !== row.driver_name) || driverTotal > driverFee) {
    db.prepare('DELETE FROM driver_payment_allocations WHERE trip_type = ? AND trip_id = ?').run(tripType, tripId);
    syncTripDriverPaid(tripType, tripId);
  }
}

/**
 * Everything that must happen to the ledgers after one piece of work is
 * created, changed or removed. Safe to call with names that no longer exist —
 * pass the previous client/driver too when a record was reassigned, so the
 * party that lost the work gets its money back as credit.
 */
export function reconcileWork(opts: {
  tripType: TripType;
  tripId?: string;
  clientNames?: (string | null | undefined)[];
  driverNames?: (string | null | undefined)[];
}) {
  if (opts.tripId) releaseStaleAllocations(opts.tripType, opts.tripId);
  for (const name of new Set((opts.clientNames ?? []).filter(Boolean) as string[])) applyClientCredit(name);
  for (const name of new Set((opts.driverNames ?? []).filter(Boolean) as string[])) applyDriverAdvance(name);
}

/**
 * Validate one manual allocation before it is written: the target must exist,
 * belong to the named party, and still have room for the amount. Returns an
 * error string, or null when the allocation is sound. Without this, a typo'd
 * trip id or an over-allocation survives until the next work edit — which
 * then wipes EVERY allocation on that row, correct ones included.
 */
export function manualAllocationError(
  side: 'client' | 'driver',
  partyName: string,
  tripType: TripType,
  tripId: string,
  amount: number
): string | null {
  const table = tripType === 'transport' ? 'client_trips' : 'material_resales';
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(tripId) as any;
  if (!row) return `target ${tripId} does not exist`;

  if (side === 'client') {
    const owner = tripType === 'transport' ? row.client_name : row.end_client;
    if (owner !== partyName) return `target ${tripId} belongs to ${owner || 'no one'}, not ${partyName}`;
    const fee = tripType === 'transport'
      ? tripClientFee({ truckCost: row.truck_cost })
      : (row.client_selling_price ?? 0);
    if ((row.client_paid ?? 0) + amount > fee + MONEY_EPSILON) {
      return `target ${tripId} only has ${fee - (row.client_paid ?? 0)} remaining`;
    }
  } else {
    if (row.driver_name !== partyName) return `target ${tripId} belongs to ${row.driver_name || 'no one'}, not ${partyName}`;
    const wage = tripType === 'transport'
      ? (row.driver_cut ?? 0)
      : Math.max(1, row.trip_count ?? 1) * (row.driver_cost ?? 0);
    if ((row.driver_paid ?? 0) + amount > wage + MONEY_EPSILON) {
      return `target ${tripId} only has ${wage - (row.driver_paid ?? 0)} remaining`;
    }
  }
  return null;
}
