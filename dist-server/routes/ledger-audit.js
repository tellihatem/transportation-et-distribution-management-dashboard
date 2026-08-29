"use strict";
/**
 * Ledger self-audit — GET /api/health/ledger-audit
 *
 * Read-only reconciliation of everything the money model promises:
 *   - every paid cache equals the sum of its allocation rows
 *   - no cache exceeds what the row is actually worth
 *   - no allocation row points at work that no longer exists
 *   - every stored resale invoice equals the recomputed goods + transport
 *
 * Many independent paths write these numbers (routes, sweeps, backup import,
 * cloud restore, migrations), so drift has historically been silent until an
 * edit tripped over it. This endpoint makes it a one-call question — the test
 * suites call it after every scenario, and support can call it on a client's
 * machine before trusting any other figure.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../database"));
const error_handler_1 = require("../middleware/error-handler");
const resale_math_1 = require("../resale-math");
const trip_math_1 = require("../trip-math");
const ledgers_1 = require("../ledgers");
const router = (0, express_1.Router)();
router.get('/', (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const issues = [];
    const off = (a, b) => Math.abs(a - b) > ledgers_1.MONEY_EPSILON;
    // 1. Caches vs allocation sums.
    const cacheChecks = [
        { table: 'client_trips', cache: 'client_paid', alloc: 'client_payment_allocations', typeCol: 'trip_type', type: 'transport', idCol: 'trip_id' },
        { table: 'client_trips', cache: 'driver_paid', alloc: 'driver_payment_allocations', typeCol: 'trip_type', type: 'transport', idCol: 'trip_id' },
        { table: 'material_resales', cache: 'client_paid', alloc: 'client_payment_allocations', typeCol: 'trip_type', type: 'resale', idCol: 'trip_id' },
        { table: 'material_resales', cache: 'driver_paid', alloc: 'driver_payment_allocations', typeCol: 'trip_type', type: 'resale', idCol: 'trip_id' },
        { table: 'material_resales', cache: 'supplier_paid', alloc: 'supplier_payment_allocations', typeCol: 'target_type', type: 'resale', idCol: 'target_id' },
        { table: 'supplier_invoices', cache: 'paid', alloc: 'supplier_payment_allocations', typeCol: 'target_type', type: 'invoice', idCol: 'target_id' },
    ];
    for (const c of cacheChecks) {
        const rows = database_1.default.prepare(`
      SELECT t.id, COALESCE(t.${c.cache}, 0) as cached, COALESCE((
        SELECT SUM(a.amount) FROM ${c.alloc} a
        WHERE a.${c.typeCol} = '${c.type}' AND a.${c.idCol} = t.id
      ), 0) as allocated
      FROM ${c.table} t
    `).all();
        for (const r of rows) {
            if (off(r.cached, r.allocated)) {
                issues.push({ kind: 'cache-mismatch', table: c.table, id: r.id, detail: `${c.cache}=${r.cached} but allocations sum to ${r.allocated}` });
            }
        }
    }
    // 2. Orphaned allocations.
    const orphanChecks = [
        { alloc: 'client_payment_allocations', typeCol: 'trip_type', idCol: 'trip_id', map: { transport: 'client_trips', resale: 'material_resales' } },
        { alloc: 'driver_payment_allocations', typeCol: 'trip_type', idCol: 'trip_id', map: { transport: 'client_trips', resale: 'material_resales' } },
        { alloc: 'supplier_payment_allocations', typeCol: 'target_type', idCol: 'target_id', map: { resale: 'material_resales', invoice: 'supplier_invoices' } },
    ];
    for (const o of orphanChecks) {
        for (const [type, table] of Object.entries(o.map)) {
            const orphans = database_1.default.prepare(`
        SELECT id, ${o.idCol} as target FROM ${o.alloc}
        WHERE ${o.typeCol} = ? AND ${o.idCol} NOT IN (SELECT id FROM ${table})
      `).all(type);
            for (const r of orphans) {
                issues.push({ kind: 'orphan-allocation', table: o.alloc, id: r.id, detail: `points at missing ${type} ${r.target}` });
            }
        }
    }
    // 3. Caches beyond what the work is worth.
    for (const t of database_1.default.prepare('SELECT * FROM client_trips').all()) {
        const fee = (0, trip_math_1.tripClientFee)({ truckCost: t.truck_cost });
        if ((t.client_paid ?? 0) > fee + ledgers_1.MONEY_EPSILON) {
            issues.push({ kind: 'overpaid-cache', table: 'client_trips', id: t.id, detail: `client_paid=${t.client_paid} exceeds fee ${fee}` });
        }
        if ((t.driver_paid ?? 0) > (t.driver_cut ?? 0) + ledgers_1.MONEY_EPSILON) {
            issues.push({ kind: 'overpaid-cache', table: 'client_trips', id: t.id, detail: `driver_paid=${t.driver_paid} exceeds wage ${t.driver_cut}` });
        }
    }
    for (const r of database_1.default.prepare('SELECT * FROM material_resales').all()) {
        const trips = (0, resale_math_1.resaleTripCount)({ tripCount: r.trip_count });
        const wage = trips * (r.driver_cost ?? 0);
        const goods = (r.factory_purchase_price ?? 0) * (r.total_tonnage ?? 0);
        if ((r.client_paid ?? 0) > (r.client_selling_price ?? 0) + ledgers_1.MONEY_EPSILON) {
            issues.push({ kind: 'overpaid-cache', table: 'material_resales', id: r.id, detail: `client_paid=${r.client_paid} exceeds invoice ${r.client_selling_price}` });
        }
        if ((r.driver_paid ?? 0) > wage + ledgers_1.MONEY_EPSILON) {
            issues.push({ kind: 'overpaid-cache', table: 'material_resales', id: r.id, detail: `driver_paid=${r.driver_paid} exceeds wage ${wage}` });
        }
        if ((r.supplier_paid ?? 0) > goods + ledgers_1.MONEY_EPSILON) {
            issues.push({ kind: 'overpaid-cache', table: 'material_resales', id: r.id, detail: `supplier_paid=${r.supplier_paid} exceeds goods cost ${goods}` });
        }
        // 4. Stored invoice vs the shared math — the two truths must agree.
        const recomputed = (0, resale_math_1.calcResale)({
            factoryPurchasePrice: r.factory_purchase_price ?? 0,
            productUnitPrice: r.product_unit_price ?? 0,
            totalTonnage: r.total_tonnage ?? 0,
            truckCost: r.truck_cost ?? 0,
            driverCost: r.driver_cost ?? 0,
            tripCount: r.trip_count,
        }).invoiceTotal;
        if (off(r.client_selling_price ?? 0, recomputed)) {
            issues.push({ kind: 'invoice-drift', table: 'material_resales', id: r.id, detail: `stored ${r.client_selling_price} vs recomputed ${recomputed}` });
        }
    }
    res.json({ success: true, data: { clean: issues.length === 0, issueCount: issues.length, issues } });
}));
exports.default = router;
