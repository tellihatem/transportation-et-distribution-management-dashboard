"use strict";
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
 * Transport follows the same rule as a plain transport trip (server/trip-math.ts):
 * تأجير الشاحنة is the whole charge for a trip, أجرة السائق is paid out of it,
 * and the margin is the difference rather than a figure anyone types.
 *
 * The model, with the worked example (1,500 buy / 4,500 sell × 40 units,
 * one trip hired at 31,000 with a 5,000 driver wage):
 *
 *   Goods
 *     totalBuyCost       = factoryPurchasePrice × quantity      60,000
 *     totalSellRevenue   = productUnitPrice     × quantity     180,000
 *     grossProductProfit = totalSellRevenue - totalBuyCost     120,000
 *
 *   Transport (both figures are PER TRIP)
 *     costPerTrip        = truckCost, the hire, whole            31,000
 *     marginPerTrip      = truckCost - driverCost                26,000
 *     transportTotal     = tripCount × costPerTrip               31,000
 *
 *   Profit
 *     hiddenProfit       = grossProductProfit - transportTotal   89,000
 *     netRealProfit      = hiddenProfit + tripCount × margin    115,000
 *
 *   Invoice
 *     invoiceTotal       = totalSellRevenue + transportTotal    211,000
 *
 * netRealProfit is equivalently grossProductProfit − tripCount × driverCost:
 * the driver's wage is the only part of a trip that costs the company money,
 * because the truck is its own. Both readings agree at any trip count.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resaleTripCount = resaleTripCount;
exports.calcResale = calcResale;
exports.calcInvoiceTotal = calcInvoiceTotal;
/** Every delivery is at least one trip. */
function resaleTripCount(tx) {
    return Math.max(1, Number(tx.tripCount) || 1);
}
function calcResale(tx) {
    const qty = Number(tx.totalTonnage) || 0;
    const trips = resaleTripCount(tx);
    const totalBuyCost = (Number(tx.factoryPurchasePrice) || 0) * qty;
    const totalSellRevenue = (Number(tx.productUnitPrice) || 0) * qty;
    const grossProductProfit = totalSellRevenue - totalBuyCost;
    const costPerTrip = Number(tx.truckCost) || 0;
    const marginPerTrip = costPerTrip - (Number(tx.driverCost) || 0);
    const transportTotal = trips * costPerTrip;
    const hiddenProfit = grossProductProfit - transportTotal;
    const netRealProfit = hiddenProfit + trips * marginPerTrip;
    return {
        trips,
        totalBuyCost,
        totalSellRevenue,
        grossProductProfit,
        costPerTrip,
        marginPerTrip,
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
function calcInvoiceTotal(tx) {
    return calcResale(tx).invoiceTotal;
}
