/**
 * Resale money — the single definition, shared by the server and the UI.
 *
 * The frontend imports this exact file (src/App.tsx → ../server/resale-math),
 * so the modal, the invoice, the dashboard cards and the API can never drift
 * apart the way they did when each screen carried its own copy of the sums.
 *
 * Deliberately pure: no imports, no I/O, no rounding. Money keeps its exact
 * value all the way through.
 *
 * The model, with the worked example (1,500 buy / 4,500 sell × 40 units,
 * one trip of 18,000 + 5,000 + 8,000):
 *
 *   Goods
 *     totalBuyCost       = factoryPurchasePrice × quantity      60,000
 *     totalSellRevenue   = productUnitPrice     × quantity     180,000
 *     grossProductProfit = totalSellRevenue - totalBuyCost     120,000
 *
 *   Transport (all three figures are PER TRIP)
 *     costPerTrip        = truck + driver + visible margin       31,000
 *     transportTotal     = tripCount × costPerTrip               31,000
 *
 *   Profit
 *     hiddenProfit       = grossProductProfit - transportTotal   89,000
 *     netRealProfit      = hiddenProfit + tripCount × margin     97,000
 *
 *   Invoice
 *     invoiceTotal       = totalSellRevenue + transportTotal    211,000
 *
 * netRealProfit is equivalently grossProductProfit − tripCount × (truck +
 * driver): the visible margin added back is the part of the transport charge
 * that is profit rather than cost. Both readings agree at any trip count.
 */

/** The numbers a resale calculation needs. Field names match MaterialResaleTx. */
export interface ResaleInputs {
  factoryPurchasePrice: number;
  productUnitPrice: number;
  totalTonnage: number;
  truckCost: number;
  driverCost: number;
  explicitProfit: number;
  tripCount?: number;
}

export interface ResaleTotals {
  trips: number;
  totalBuyCost: number;
  totalSellRevenue: number;
  grossProductProfit: number;
  costPerTrip: number;
  transportTotal: number;
  hiddenProfit: number;
  netRealProfit: number;
  invoiceTotal: number;
}

/** Every delivery is at least one trip. */
export function resaleTripCount(tx: { tripCount?: number | null }): number {
  return Math.max(1, Number(tx.tripCount) || 1);
}

export function calcResale(tx: ResaleInputs): ResaleTotals {
  const qty = Number(tx.totalTonnage) || 0;
  const trips = resaleTripCount(tx);

  const totalBuyCost = (Number(tx.factoryPurchasePrice) || 0) * qty;
  const totalSellRevenue = (Number(tx.productUnitPrice) || 0) * qty;
  const grossProductProfit = totalSellRevenue - totalBuyCost;

  const costPerTrip =
    (Number(tx.truckCost) || 0) + (Number(tx.driverCost) || 0) + (Number(tx.explicitProfit) || 0);
  const transportTotal = trips * costPerTrip;

  const hiddenProfit = grossProductProfit - transportTotal;
  const netRealProfit = hiddenProfit + trips * (Number(tx.explicitProfit) || 0);

  return {
    trips,
    totalBuyCost,
    totalSellRevenue,
    grossProductProfit,
    costPerTrip,
    transportTotal,
    hiddenProfit,
    netRealProfit,
    invoiceTotal: totalSellRevenue + transportTotal,
  };
}

/**
 * The amount billed to the client. Stored on the row because the payment
 * ledgers settle against it, but always computed from the parts so the
 * invoice lines and the total can never disagree.
 */
export function calcInvoiceTotal(tx: ResaleInputs): number {
  return calcResale(tx).invoiceTotal;
}
