/**
 * Transport-trip money — the single definition, shared by the server and the UI.
 *
 * The frontend imports this exact file (src/App.tsx → ../server/trip-math), the
 * same arrangement as resale-math.ts, so the form, the invoice, the ledgers and
 * the dashboard cards cannot drift apart.
 *
 * The model:
 *
 *   تأجير الشاحنة (truckCost) is the price agreed with the client — the whole
 *   of it, and the only figure the client is ever billed or shown.
 *
 *   أجرة السائق (driverCut) is paid OUT of that price, not added to it.
 *
 *   ربح الشركة (companyProfit) is therefore not a number anyone types: it is
 *   what the rental leaves once the driver is paid.
 *
 *     truck hire   25,000   ← the invoice
 *     driver wage  20,000   ← internal
 *     profit        5,000   ← 25,000 − 20,000
 *
 * A wage above the rental yields a negative profit. That is left to stand: a
 * trip really can be run at a loss, and hiding it would be a lie.
 */

export interface TripFeeInputs {
  truckCost: number;
  driverCut: number;
}

/** What the client owes for the trip: the agreed truck hire, whole. */
export function tripClientFee(t: { truckCost?: number | null }): number {
  return Number(t.truckCost) || 0;
}

/** What the company keeps: the hire less the driver's wage. */
export function tripCompanyProfit(t: TripFeeInputs): number {
  return (Number(t.truckCost) || 0) - (Number(t.driverCut) || 0);
}

/**
 * The same rule in SQL, for the ledger queries that compare what a trip is
 * worth against what has been allocated to it. Kept beside its TypeScript twin
 * so the two are read — and changed — together.
 */
export const TRIP_CLIENT_FEE_SQL = 'truck_cost';
