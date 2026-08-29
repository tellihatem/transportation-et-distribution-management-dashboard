/**
 * EntryModal — the add/edit dialog for trips, resales and expenses.
 *
 * Extracted from App.tsx so that typing in a form re-renders only this
 * component. When these states lived in App, every keystroke reconciled the
 * whole application behind the dialog — tables, charts, deck — which was a
 * large part of the UI feeling slower as the day's data grew.
 *
 * The component is remounted per open (App keys it on a nonce), so the form
 * states initialise straight from `initial` with no syncing effects. In add
 * mode the next record id is fetched AFTER the dialog opens — the dialog
 * appearing must never wait on the network (a slow /next-id used to make the
 * Add button look dead).
 */

import React, { useState, useEffect } from "react";
import { Truck, X } from "lucide-react";
import type { ClientTransportTripInput, MaterialResaleTxInput, OtherExpense } from "../types";
import { tripClientFee, tripCompanyProfit } from "../../server/trip-math";
import { calcResale } from "../../server/resale-math";
import { fetchNextTripId, fetchNextResaleId, fetchNextExpenseId } from "../api/client";
import { appAlert } from "./AppDialogs";
import { T } from "../strings";
import { EXPENSE_CATEGORIES } from "../data";

const QUANTITY_UNITS = T.units.suggestions;

export type EntryRecordType = "transport" | "resale" | "expenses";

interface EntryModalProps {
  key?: React.Key;
  recordType: EntryRecordType;
  mode: "add" | "edit";
  /** The prepared form object for `recordType`; id may be empty in add mode. */
  initial: any;
  /** Existing ids of the record's kind, for the offline next-id fallback. */
  fallbackIds: string[];
  /** Performs the save (add or edit) and closes on success; throws on failure. */
  onSubmit: (data: any) => Promise<void>;
  onClose: () => void;
}

const localNextId = (prefix: string, ids: string[]) => {
  const max = ids.reduce((m, id) => {
    const match = id.match(/(\d+)\s*$/);
    return match ? Math.max(m, parseInt(match[1], 10)) : m;
  }, 0);
  return `${prefix}${max + 1}`;
};
export function EntryModal({ recordType, mode, initial, fallbackIds, onSubmit, onClose }: EntryModalProps) {
  // The three form states live HERE, not in App: a keystroke in a money
  // field must re-render this dialog, not the whole application behind it.
  // State for Trip (Tab 1 Form)
  const [tripForm, setTripForm] = useState<Partial<ClientTransportTripInput>>(
    recordType === "transport" && initial ? initial : {
    id: "",
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    originFactory: "",
    destination: "",
    materialType: "",
    totalTonnage: 30,
    quantityUnit: T.common.defaultUnit,
    truckCost: 15000,
    driverCut: 10000,
    companyProfit: 5000,
    driverName: "",
  });

  // State for Resale (Tab 2 Form)
  const [resaleForm, setResaleForm] = useState<Partial<MaterialResaleTxInput>>(
    recordType === "resale" && initial ? initial : {
    id: "",
    date: new Date().toISOString().split("T")[0],
    endClient: "",
    destination: "",
    materialType: "",
    originFactory: "",
    factoryPurchasePrice: 1500,
    productUnitPrice: 4500,
    totalTonnage: 40,
    quantityUnit: T.common.defaultUnit,
    truckCost: 18000,
    driverCost: 5000,
    explicitProfit: 0,
    driverName: "",
    tripCount: 1,
  });

  // State for Expense (Tab 3 Form)
  const [expenseForm, setExpenseForm] = useState<Partial<OtherExpense>>(
    recordType === "expenses" && initial ? initial : {
    id: "",
    date: new Date().toISOString().split("T")[0],
    category: "Fuel",
    truckPlate: "",
    amount: 15000,
    status: "Paid"
  });

  // Automatically compute Total Fee suggestion for Tab 1 as feedback in form
  // The hire is the whole price; the profit is what it leaves after the wage.
  const computedFormTotalTransportFee = tripClientFee({ truckCost: Number(tripForm.truckCost) });
  const computedFormCompanyProfit = tripCompanyProfit({
    truckCost: Number(tripForm.truckCost) || 0,
    driverCut: Number(tripForm.driverCut) || 0,
  });

  // Live figures for the resale modal. Every number the form shows comes from
  // this one call, so the goods section, the transport section and the profit
  // summary cannot disagree — and a transport label can no longer end up
  // displaying a product-margin value.
  const resaleCalc = calcResale({
    factoryPurchasePrice: Number(resaleForm.factoryPurchasePrice) || 0,
    productUnitPrice: Number(resaleForm.productUnitPrice) || 0,
    totalTonnage: Number(resaleForm.totalTonnage) || 0,
    truckCost: Number(resaleForm.truckCost) || 0,
    driverCost: Number(resaleForm.driverCost) || 0,
    tripCount: Number(resaleForm.tripCount) || 1,
  });

  const [saving, setSaving] = useState(false);

  // Add mode opens instantly with an empty id, then fills it in — with the
  // local fallback if the server cannot answer.
  useEffect(() => {
    if (mode !== "add" || (initial && initial.id)) return;
    let cancelled = false;
    const prefix = recordType === "transport" ? "TR-" : recordType === "resale" ? "RS-" : "EXP-";
    const fetcher = recordType === "transport" ? fetchNextTripId : recordType === "resale" ? fetchNextResaleId : fetchNextExpenseId;
    fetcher()
      .catch(() => localNextId(prefix, fallbackIds))
      .then(id => {
        if (cancelled) return;
        if (recordType === "transport") setTripForm(p => ({ ...p, id }));
        else if (recordType === "resale") setResaleForm(p => ({ ...p, id }));
        else setExpenseForm(p => ({ ...p, id }));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      let data: any;
      if (recordType === "transport") {
        data = {
          id: tripForm.id || localNextId("TR-", fallbackIds),
          date: tripForm.date || "",
          clientName: tripForm.clientName || "",
          originFactory: tripForm.originFactory || "",
          destination: tripForm.destination || "",
          materialType: tripForm.materialType || "",
          totalTonnage: Number(tripForm.totalTonnage) || 0,
          quantityUnit: tripForm.quantityUnit || T.common.defaultUnit,
          truckCost: Number(tripForm.truckCost) || 0,
          driverCut: Number(tripForm.driverCut) || 0,
          companyProfit: computedFormCompanyProfit,
          driverName: tripForm.driverName || ""
        } satisfies ClientTransportTripInput;
      } else if (recordType === "resale") {
        data = {
          id: resaleForm.id || localNextId("RS-", fallbackIds),
          date: resaleForm.date || "",
          endClient: resaleForm.endClient || "",
          destination: resaleForm.destination || "",
          materialType: resaleForm.materialType || "",
          originFactory: resaleForm.originFactory || "",
          factoryPurchasePrice: Number(resaleForm.factoryPurchasePrice) || 0,
          productUnitPrice: Number(resaleForm.productUnitPrice) || 0,
          totalTonnage: Number(resaleForm.totalTonnage) || 0,
          quantityUnit: resaleForm.quantityUnit || T.common.defaultUnit,
          truckCost: Number(resaleForm.truckCost) || 0,
          driverCost: Number(resaleForm.driverCost) || 0,
          explicitProfit: resaleCalc.marginPerTrip,
          driverName: resaleForm.driverName || "",
          tripCount: Math.max(1, Number(resaleForm.tripCount) || 1),
        } satisfies MaterialResaleTxInput;
      } else {
        data = {
          id: expenseForm.id || localNextId("EXP-", fallbackIds),
          date: expenseForm.date || "",
          category: expenseForm.category || "Fuel",
          truckPlate: expenseForm.truckPlate || T.expenses.unknownPlate,
          amount: Number(expenseForm.amount) || 0,
          status: (expenseForm.status as "Paid" | "Pending") || "Paid"
        } satisfies OtherExpense;
      }
      await onSubmit(data);
    } catch (err: any) {
      await appAlert(T.dialogs.saveFailed(err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
  <div className="no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex dialog-scroll justify-center p-4">
    <div className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-2xl overflow-hidden p-6 shadow-2xl relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>

      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-5">
        <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
          <Truck className="h-4.5 w-4.5 text-blue-500" />
          <span>
            {mode === "add" ? T.form.titleAdd : T.form.titleEdit}
          </span>
          <span className="text-xs font-normal text-slate-400">
            ({recordType === "transport" ? T.form.kindTransport : recordType === "resale" ? T.form.kindResale : T.form.kindExpense})
          </span>
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Suggested quantity units — the field stays free-text so any
          other unit can be typed in directly. */}
      <datalist id="quantity-units">
        {QUANTITY_UNITS.map(u => <option key={u} value={u} />)}
      </datalist>

      {/* DYNAMIC FORMS ACCORDING TO TABS */}
      <form onSubmit={submit} className="space-y-4">

        {recordType === "transport" && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.tripId}</label>
                <input
                  type="text"
                  required
                  disabled={mode === "edit"}
                  value={tripForm.id || ""} placeholder="…"
                  onChange={e => setTripForm(p => ({ ...p, id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.date}</label>
                <input
                  type="date"
                  required
                  value={tripForm.date}
                  onChange={e => setTripForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.clientName}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.clientNamePlaceholder}
                  value={tripForm.clientName}
                  onChange={e => setTripForm(p => ({ ...p, clientName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.driverName}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.tripDriverPlaceholder}
                  value={tripForm.driverName}
                  onChange={e => setTripForm(p => ({ ...p, driverName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.originFactory}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.originFactoryPlaceholder}
                  value={tripForm.originFactory}
                  onChange={e => setTripForm(p => ({ ...p, originFactory: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.destination}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.destinationPlaceholder}
                  value={tripForm.destination}
                  onChange={e => setTripForm(p => ({ ...p, destination: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.materialType}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.materialPlaceholder}
                  value={tripForm.materialType}
                  onChange={e => setTripForm(p => ({ ...p, materialType: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.quantity}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={tripForm.totalTonnage}
                    onChange={e => setTripForm(p => ({ ...p, totalTonnage: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                  />
                  <input
                    type="text"
                    list="quantity-units"
                    required
                    placeholder={T.form.unitPlaceholder}
                    value={tripForm.quantityUnit}
                    onChange={e => setTripForm(p => ({ ...p, quantityUnit: e.target.value }))}
                    className="w-24 shrink-0 bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* STRUCTURE LOGIC - DRIVERS AND PROFITS CORES */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] text-cyan-400 font-bold block">{T.form.costBreakdownTitle}</span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.truckHire}</label>
                  <input
                    type="number"
                    required
                    value={tripForm.truckCost}
                    onChange={e => setTripForm(p => ({ ...p, truckCost: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.driverWage}</label>
                  <input
                    type="number"
                    required
                    value={tripForm.driverCut}
                    onChange={e => setTripForm(p => ({ ...p, driverCut: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.companyProfit}</label>
                  {/* Derived, never typed: the hire less the wage. */}
                  <div
                    title={T.form.companyProfitDerivedHint}
                    className={`w-full bg-slate-900/60 border border-slate-800 p-1.5 rounded font-mono font-bold ${
                      computedFormCompanyProfit < 0 ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {computedFormCompanyProfit.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="pt-2 text-[10px] text-slate-400 flex justify-between">
                <span>{T.form.estimatedTotalFee}</span>
                <strong className="text-emerald-400">{computedFormTotalTransportFee.toLocaleString()} {T.common.currency}</strong>
              </div>
            </div>

            {/* Note: Payment tracking (المدفوعات) is now managed via the Client Accounts and Driver Accounts tabs */}
          </div>
        )}

        {recordType === "resale" && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.resaleId}</label>
                <input
                  type="text"
                  required
                  disabled={mode === "edit"}
                  value={resaleForm.id || ""} placeholder="…"
                  onChange={e => setResaleForm(p => ({ ...p, id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.date}</label>
                <input
                  type="date"
                  required
                  value={resaleForm.date}
                  onChange={e => setResaleForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">{T.form.endClient}</label>
              <input
                type="text"
                required
                placeholder={T.form.endClientPlaceholder}
                value={resaleForm.endClient}
                onChange={e => setResaleForm(p => ({ ...p, endClient: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.resaleDestination}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.resaleDestinationPlaceholder}
                  value={resaleForm.destination}
                  onChange={e => setResaleForm(p => ({ ...p, destination: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.driverName}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.resaleDriverPlaceholder}
                  value={resaleForm.driverName}
                  onChange={e => setResaleForm(p => ({ ...p, driverName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.resaleMaterial}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.materialPlaceholder}
                  value={resaleForm.materialType}
                  onChange={e => setResaleForm(p => ({ ...p, materialType: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.originFactory}</label>
                <input
                  type="text"
                  required
                  placeholder={T.form.originFactoryPlaceholder}
                  value={resaleForm.originFactory}
                  onChange={e => setResaleForm(p => ({ ...p, originFactory: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.factoryPurchasePrice}</label>
                <input
                  type="number"
                  required
                  value={resaleForm.factoryPurchasePrice}
                  onChange={e => setResaleForm(p => ({ ...p, factoryPurchasePrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.quantity}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    value={resaleForm.totalTonnage}
                    onChange={e => setResaleForm(p => ({ ...p, totalTonnage: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                  />
                  <input
                    type="text"
                    list="quantity-units"
                    required
                    placeholder={T.form.unitPlaceholder}
                    value={resaleForm.quantityUnit}
                    onChange={e => setResaleForm(p => ({ ...p, quantityUnit: e.target.value }))}
                    className="w-24 shrink-0 bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* ── GOODS ─────────────────────────────────────────────
                Buy cost, sell revenue and the profit the goods alone
                make. Kept strictly separate from transport below: this
                section's margin used to be rendered inside the
                logistics box, which made a transport label show a
                product figure. */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] text-amber-400 font-bold block">{T.form.goodsSectionTitle}</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.unitSellingPrice}</label>
                  <input
                    type="number"
                    required
                    value={resaleForm.productUnitPrice ?? ""}
                    placeholder={T.form.unitSellingPricePlaceholder}
                    onChange={e => setResaleForm(p => ({ ...p, productUnitPrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-slate-100"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex justify-between text-[10px] text-slate-400 pb-1">
                    <span>{T.form.totalBuyCostLabel}</span>
                    <strong className="text-rose-300 font-mono">{resaleCalc.totalBuyCost.toLocaleString()} {T.common.currency}</strong>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{T.form.totalSellRevenueLabel}</span>
                    <strong className="text-cyan-300 font-mono">{resaleCalc.totalSellRevenue.toLocaleString()} {T.common.currency}</strong>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-[10px] border-t border-slate-800 flex justify-between text-slate-400">
                <span>{T.form.grossProductProfitLabel}</span>
                <strong className="text-amber-400 font-mono">{resaleCalc.grossProductProfit.toLocaleString()} {T.common.currency}</strong>
              </div>
            </div>

            {/* ── TRANSPORT ─────────────────────────────────────────
                Truck, driver and visible margin are all PER TRIP, so
                the trip count multiplies them. Nothing from the goods
                section appears here. */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[10px] text-cyan-400 font-bold block">{T.form.logisticsTitle}</span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.truckHire}</label>
                  <input
                    type="number"
                    required
                    value={resaleForm.truckCost}
                    onChange={e => setResaleForm(p => ({ ...p, truckCost: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.resaleDriverCost}</label>
                  <input
                    type="number"
                    required
                    value={resaleForm.driverCost}
                    onChange={e => setResaleForm(p => ({ ...p, driverCost: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.explicitMargin}</label>
                  {/* Derived, never typed: the hire less the wage. */}
                  <div
                    title={T.form.explicitMarginDerivedHint}
                    className={`w-full bg-slate-900/60 border border-slate-800 p-1 rounded font-mono font-bold ${
                      resaleCalc.marginPerTrip < 0 ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {resaleCalc.marginPerTrip.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-slate-500 mb-1">{T.form.tripCount}</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={resaleForm.tripCount ?? 1}
                    onChange={e => setResaleForm(p => ({ ...p, tripCount: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-slate-100"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 pb-1">
                  <span>{T.form.tripUnitCost}</span>
                  <strong className="text-violet-300 font-mono">{resaleCalc.costPerTrip.toLocaleString()} {T.common.currency}</strong>
                </div>
              </div>

              <div className="pt-2 text-[10px] border-t border-slate-800 flex justify-between text-slate-400">
                <span>{T.form.multiTripTotal}</span>
                <strong className="text-violet-400 font-mono">
                  {resaleCalc.trips} × {resaleCalc.costPerTrip.toLocaleString()} = {resaleCalc.transportTotal.toLocaleString()} {T.common.currency}
                </strong>
              </div>
            </div>

            {/* ── PROFIT SUMMARY ────────────────────────────────────
                Its own section, so neither figure can be mistaken for
                a goods or a transport number. */}
            <div className="p-3 bg-slate-950 rounded-xl border border-emerald-900/60 space-y-2">
              <span className="text-[10px] text-emerald-400 font-bold block">{T.form.profitSummaryTitle}</span>
              <div className="pt-1 text-[11px] flex justify-between text-slate-300">
                <span className="font-bold">{T.form.trueProfitLabel}</span>
                <strong className="text-emerald-400 font-mono text-sm">{resaleCalc.netRealProfit.toLocaleString()} {T.common.currency}</strong>
              </div>
            </div>

            {/* ── WHAT THE CLIENT IS BILLED ─────────────────────────
                Derived, never typed, so the two invoice lines always
                add up to the amount the payment ledgers settle. */}
            <div className="p-3 bg-slate-900 rounded-xl border border-blue-900/60 flex justify-between items-center">
              <span className="text-[11px] text-blue-300 font-bold">{T.form.invoiceTotalLabel}</span>
              <strong className="text-blue-300 font-mono text-base">{resaleCalc.invoiceTotal.toLocaleString()} {T.common.currency}</strong>
            </div>

            {/* Note: Payment tracking (المدفوعات) is now managed via the Client Accounts and Driver Accounts tabs */}
          </div>
        )}

        {recordType === "expenses" && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.expenseId}</label>
                <input
                  type="text"
                  required
                  disabled={mode === "edit"}
                  value={expenseForm.id || ""} placeholder="…"
                  onChange={e => setExpenseForm(p => ({ ...p, id: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.date}</label>
                <input
                  type="date"
                  required
                  value={expenseForm.date}
                  onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">{T.form.expenseCategory}</label>
              <select
                value={expenseForm.category}
                onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
              >
                {EXPENSE_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">{T.form.truckPlate}</label>
              <input
                type="text"
                required
                placeholder={T.form.truckPlatePlaceholder}
                value={expenseForm.truckPlate}
                onChange={e => setExpenseForm(p => ({ ...p, truckPlate: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">{T.form.expenseAmount}</label>
                <input
                  type="number"
                  required
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">{T.form.expenseStatus}</label>
                <select
                  value={expenseForm.status}
                  onChange={e => setExpenseForm(p => ({ ...p, status: e.target.value as 'Paid' | 'Pending' }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-slate-100"
                >
                  <option value="Paid">{T.expenses.statusPaid}</option>
                  <option value="Pending">{T.expenses.statusPendingLong}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
          >
            {T.form.cancel}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/10 transition"
          >
            {saving ? T.form.savingInFlight : T.form.save}
          </button>
        </div>

      </form>
    </div>
  </div>
  );
}
