/**
 * Supplier/Factory Accounts Tab (حسابات الموردين)
 *
 * Third instance of the accounts-tab pattern (clients, drivers). Shows each
 * supplier's position — goods bought from it via resale shipments and manual
 * invoices, payments made to it, outstanding debt and prepaid credit — and
 * records payments (prepayment / repayment) and manual debt invoices.
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  Search,
  Plus,
  FileText,
  Factory,
  CheckCircle2,
  AlertCircle,
  X,
  Printer,
  ShieldCheck,
  ReceiptText,
  Pencil,
  Trash2
} from 'lucide-react';
import type { SupplierSummary, SupplierStatement, TabFilters } from '../types';
import {
  fetchSupplierStatement,
  fetchNextSupplierPaymentId,
  fetchNextSupplierInvoiceId,
  fetchSupplierAvailableAdvance
} from '../api/client';
import { T } from '../strings';

interface SupplierAccountsTabProps {
  summaries: SupplierSummary[];
  loading: boolean;
  filters: TabFilters;
  onRecordPayment: (payload: any) => Promise<any>;
  onRecordInvoice: (payload: any) => Promise<any>;
  onDeductAdvance: (payload: {
    supplierName: string;
    targetType: 'resale' | 'invoice';
    targetId: string;
    amount: number;
  }) => Promise<{ deducted: number; remainingAdvance: number; targetRemaining: number }>;
  onUpdatePayment: (id: string, payload: any) => Promise<any>;
  onDeletePayment: (id: string) => Promise<any>;
  onUpdateInvoice: (id: string, payload: any) => Promise<any>;
  onDeleteInvoice: (id: string) => Promise<any>;
  onRefresh: () => void;
}

export function SupplierAccountsTab({
  summaries,
  loading,
  filters,
  onRecordPayment,
  onRecordInvoice,
  onDeductAdvance,
  onUpdatePayment,
  onDeletePayment,
  onUpdateInvoice,
  onDeleteInvoice,
  onRefresh
}: SupplierAccountsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementData, setStatementData] = useState<SupplierStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Correcting a payment already recorded. editingId doubles as "the edit
  // dialog is open", and holds which receipt is being corrected.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Correcting a debt/invoice already recorded, kept separate from the
  // payment dialog so neither can be half-open over the other.
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    date: '',
    supplierName: '',
    amount: 0,
    notes: '',
  });
  const [editForm, setEditForm] = useState({
    date: '',
    supplierName: '',
    amount: 0,
    paymentType: '',
    notes: '',
    allocationMode: 'auto' as 'auto' | 'none',
  });

  // Drawdown box state
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [deductSupplier, setDeductSupplier] = useState('');
  const [availableAdvance, setAvailableAdvance] = useState(0);
  const [deductItems, setDeductItems] = useState<SupplierStatement['itemized']>([]);
  const [deductAmounts, setDeductAmounts] = useState<Record<string, number>>({});
  const [loadingDeduct, setLoadingDeduct] = useState(false);
  const [deductingId, setDeductingId] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState({
    id: '',
    date: new Date().toISOString().split('T')[0],
    supplierName: '',
    amount: 100000,
    paymentType: T.supplierAccounts.paymentTypeRepay as string,
    notes: '',
    allocationMode: 'auto' as 'auto' | 'none',
  });

  const [invoiceForm, setInvoiceForm] = useState({
    id: '',
    date: new Date().toISOString().split('T')[0],
    supplierName: '',
    amount: 50000,
    notes: '',
  });

  const openPaymentForSupplier = async (supplierName: string) => {
    try {
      const nextId = await fetchNextSupplierPaymentId();
      setPaymentForm(prev => ({
        ...prev,
        id: nextId,
        supplierName,
        date: new Date().toISOString().split('T')[0],
        amount: 100000,
        paymentType: T.supplierAccounts.paymentTypeRepay,
        allocationMode: 'auto'
      }));
      setIsPaymentModalOpen(true);
    } catch (e) {
      console.error('Failed to get next supplier payment ID:', e);
    }
  };

  const openInvoiceForSupplier = async (supplierName: string) => {
    try {
      const nextId = await fetchNextSupplierInvoiceId();
      setInvoiceForm({
        id: nextId,
        date: new Date().toISOString().split('T')[0],
        supplierName,
        amount: 50000,
        notes: '',
      });
      setIsInvoiceModalOpen(true);
    } catch (e) {
      console.error('Failed to get next supplier invoice ID:', e);
    }
  };

  /**
   * The drawdown box: the supplier's remaining advance plus every shipment
   * and invoice still owing, so the owner can deduct one at a time.
   */
  const openDeductForSupplier = async (supplierName: string) => {
    setDeductSupplier(supplierName);
    setIsDeductModalOpen(true);
    setLoadingDeduct(true);
    try {
      const [advance, statement] = await Promise.all([
        fetchSupplierAvailableAdvance(supplierName),
        fetchSupplierStatement(supplierName)
      ]);
      setAvailableAdvance(advance);
      const unsettled = statement.itemized.filter(i => i.remaining > 0);
      setDeductItems(unsettled);
      // Prefill each row with whatever can actually be deducted right now.
      const amounts: Record<string, number> = {};
      for (const i of unsettled) amounts[i.id] = Math.min(i.remaining, advance);
      setDeductAmounts(amounts);
    } catch (e) {
      console.error('Failed to load deduction data:', e);
    } finally {
      setLoadingDeduct(false);
    }
  };

  const handleDeduct = async (item: SupplierStatement['itemized'][number]) => {
    const amount = Number(deductAmounts[item.id]) || 0;
    if (amount <= 0) return;
    setDeductingId(item.id);
    try {
      const result = await onDeductAdvance({
        supplierName: deductSupplier,
        targetType: item.type,
        targetId: item.id,
        amount,
      });
      alert(T.supplierAccounts.deductDone(
        result.deducted.toLocaleString(),
        result.remainingAdvance.toLocaleString()
      ));
      await openDeductForSupplier(deductSupplier); // refresh the box in place
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.deductError(err.message));
    } finally {
      setDeductingId(null);
    }
  };

  const openStatementForSupplier = async (supplierName: string) => {
    setLoadingStatement(true);
    setIsStatementModalOpen(true);
    try {
      const data = await fetchSupplierStatement(supplierName);
      setStatementData(data);
    } catch (e) {
      console.error('Failed to load supplier statement:', e);
    } finally {
      setLoadingStatement(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.supplierName || paymentForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onRecordPayment({
        id: paymentForm.id,
        date: paymentForm.date,
        supplierName: paymentForm.supplierName,
        amount: Number(paymentForm.amount),
        paymentType: paymentForm.paymentType,
        notes: paymentForm.notes,
        allocationMode: paymentForm.allocationMode,
      });
      setIsPaymentModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.saveError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.supplierName || invoiceForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onRecordInvoice({
        id: invoiceForm.id,
        date: invoiceForm.date,
        supplierName: invoiceForm.supplierName,
        amount: Number(invoiceForm.amount),
        notes: invoiceForm.notes,
      });
      setIsInvoiceModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.invoiceSaveError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditForPayment = (p: SupplierStatement['payments'][number], supplierName: string) => {
    setEditForm({
      date: p.date,
      supplierName,
      amount: p.amount,
      paymentType: p.paymentType || T.supplierAccounts.paymentTypeRepay,
      notes: p.notes || '',
      // A payment that was never applied is an advance; keep it one unless
      // the owner deliberately switches to auto.
      allocationMode: p.allocatedAmount > 0 ? 'auto' : 'none',
    });
    setEditingId(p.id);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm.supplierName || editForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onUpdatePayment(editingId, {
        date: editForm.date,
        supplierName: editForm.supplierName,
        amount: Number(editForm.amount),
        paymentType: editForm.paymentType,
        notes: editForm.notes,
        allocationMode: editForm.allocationMode,
      });
      setEditingId(null);
      // The statement is open behind this dialog — refresh it so the
      // corrected figures replace the old ones immediately.
      await openStatementForSupplier(editForm.supplierName);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.editError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayment = async (p: SupplierStatement['payments'][number], supplierName: string) => {
    if (!confirm(T.supplierAccounts.deleteConfirm(p.id, p.amount.toLocaleString()))) return;
    try {
      await onDeletePayment(p.id);
      await openStatementForSupplier(supplierName);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.deleteError(err.message));
    }
  };

  const openEditForInvoice = (item: SupplierStatement['itemized'][number], supplierName: string) => {
    setEditInvoiceForm({
      date: item.date,
      supplierName,
      amount: item.owed,
      notes: item.description || '',
    });
    setEditingInvoiceId(item.id);
  };

  const handleEditInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoiceId || !editInvoiceForm.supplierName || editInvoiceForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onUpdateInvoice(editingInvoiceId, {
        date: editInvoiceForm.date,
        supplierName: editInvoiceForm.supplierName,
        amount: Number(editInvoiceForm.amount),
        notes: editInvoiceForm.notes,
      });
      setEditingInvoiceId(null);
      await openStatementForSupplier(editInvoiceForm.supplierName);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.editInvoiceError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvoice = async (item: SupplierStatement['itemized'][number], supplierName: string) => {
    if (!confirm(T.supplierAccounts.deleteInvoiceConfirm(item.id, item.owed.toLocaleString()))) return;
    try {
      await onDeleteInvoice(item.id);
      await openStatementForSupplier(supplierName);
      onRefresh();
    } catch (err: any) {
      alert(T.supplierAccounts.deleteInvoiceError(err.message));
    }
  };

  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      const query = (searchTerm || filters.searchQuery || '').toLowerCase().trim();
      if (!query) return true;
      return s.supplierName.toLowerCase().includes(query);
    });
  }, [summaries, searchTerm, filters.searchQuery]);

  const grandTotals = useMemo(() => {
    return summaries.reduce(
      (acc, curr) => ({
        owed: acc.owed + curr.totalOwed,
        paid: acc.paid + curr.totalPaymentsGiven,
        debt: acc.debt + curr.outstandingDebt,
        prepaid: acc.prepaid + curr.prepaidBalance
      }),
      { owed: 0, paid: 0, debt: 0, prepaid: 0 }
    );
  }, [summaries]);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-blue-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-400 text-sm font-medium mb-1">
            <span>{T.supplierAccounts.kpiPrepaid}</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-300">
            {grandTotals.prepaid.toLocaleString()} <span className="text-xs font-normal text-blue-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-blue-400/80 mt-1">{T.supplierAccounts.kpiPrepaidHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-amber-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-400 text-sm font-medium mb-1">
            <span>{T.supplierAccounts.kpiDebt}</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {grandTotals.debt.toLocaleString()} <span className="text-xs font-normal text-amber-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-amber-500/80 mt-1">{T.supplierAccounts.kpiDebtHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-1">
            <span>{T.supplierAccounts.kpiOwed}</span>
            <Factory className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">
            {grandTotals.owed.toLocaleString()} <span className="text-xs font-normal text-slate-400">{T.common.currency}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">{T.supplierAccounts.kpiOwedHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-emerald-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400 text-sm font-medium mb-1">
            <span>{T.supplierAccounts.kpiPaid}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300">
            {grandTotals.paid.toLocaleString()} <span className="text-xs font-normal text-emerald-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-emerald-500/80 mt-1">{T.supplierAccounts.kpiPaidHint}</div>
        </div>
      </div>

      {/* Control bar & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={T.supplierAccounts.searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openInvoiceForSupplier(filteredSummaries[0]?.supplierName || '')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-amber-950/40"
          >
            <ReceiptText className="w-4 h-4" />
            {T.supplierAccounts.recordInvoiceButton}
          </button>
          <button
            onClick={() => openPaymentForSupplier(filteredSummaries[0]?.supplierName || '')}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-950/40"
          >
            <Plus className="w-4 h-4" />
            {T.supplierAccounts.recordPaymentButton}
          </button>
        </div>
      </div>

      {/* Supplier Accounts Table */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-4">{T.supplierAccounts.colName}</th>
                <th className="p-4">{T.supplierAccounts.colOwed}</th>
                <th className="p-4">{T.supplierAccounts.colPaid}</th>
                <th className="p-4">{T.supplierAccounts.colDebt}</th>
                <th className="p-4">{T.supplierAccounts.colPrepaid}</th>
                <th className="p-4">{T.supplierAccounts.colShipments}</th>
                <th className="p-4 text-center">{T.supplierAccounts.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.supplierAccounts.loading}
                  </td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.supplierAccounts.empty}
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-4 font-semibold text-slate-100 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center font-bold text-xs">
                        {s.supplierName.charAt(0)}
                      </div>
                      {s.supplierName}
                    </td>
                    <td className="p-4 font-mono font-medium text-slate-200">
                      {s.totalOwed.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold text-emerald-400">
                      {s.totalPaymentsGiven.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold">
                      {s.outstandingDebt > 0 ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded text-xs">
                          {s.outstandingDebt.toLocaleString()} {T.common.currency}
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs font-normal">{T.supplierAccounts.settled}</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      {s.prepaidBalance > 0 ? (
                        <span className="text-blue-400 bg-blue-950/40 border border-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                          +{s.prepaidBalance.toLocaleString()} {T.common.currency}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">0 {T.common.currency}</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-300">
                      <span className="font-bold text-slate-100">{s.shipmentsCount}</span> {T.supplierAccounts.shipmentsCell(s.unpaidCount)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openPaymentForSupplier(s.supplierName)}
                          className="px-3 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {T.supplierAccounts.payAction}
                        </button>
                        <button
                          onClick={() => openDeductForSupplier(s.supplierName)}
                          disabled={s.prepaidBalance <= 0}
                          className="px-3 py-1.5 bg-blue-900/60 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-blue-200 border border-blue-700/60 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {T.supplierAccounts.deductAction}
                        </button>
                        <button
                          onClick={() => openStatementForSupplier(s.supplierName)}
                          className="px-3 py-1.5 bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {T.supplierAccounts.statementAction}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <CreditCard className="w-5 h-5" />
                {T.supplierAccounts.paymentModalTitle}
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={paymentForm.id}
                    onChange={e => setPaymentForm({ ...paymentForm, id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldDate}</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldSupplierName}</label>
                <input
                  type="text"
                  placeholder={T.supplierAccounts.fieldSupplierNamePlaceholder}
                  value={paymentForm.supplierName}
                  onChange={e => setPaymentForm({ ...paymentForm, supplierName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldAmount}</label>
                  <input
                    type="number"
                    min={1}
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-cyan-700/60 rounded-lg px-3 py-2 text-base text-cyan-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldPaymentType}</label>
                  <select
                    value={paymentForm.paymentType}
                    onChange={e => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.supplierAccounts.paymentTypeRepay}>{T.supplierAccounts.paymentTypeRepay}</option>
                    <option value={T.supplierAccounts.paymentTypePrepay}>{T.supplierAccounts.paymentTypePrepay}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.supplierAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    paymentForm.allocationMode === 'auto'
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeSupplier"
                        checked={paymentForm.allocationMode === 'auto'}
                        onChange={() => setPaymentForm({ ...paymentForm, allocationMode: 'auto' })}
                        className="accent-cyan-500"
                      />
                      {T.supplierAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.supplierAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    paymentForm.allocationMode === 'none'
                      ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeSupplier"
                        checked={paymentForm.allocationMode === 'none'}
                        onChange={() => setPaymentForm({ ...paymentForm, allocationMode: 'none' })}
                        className="accent-blue-500"
                      />
                      {T.supplierAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.supplierAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  placeholder={T.supplierAccounts.fieldNotesPlaceholder}
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  {T.supplierAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-950/50 flex items-center gap-2"
                >
                  {submitting ? T.supplierAccounts.saving : T.supplierAccounts.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD DEBT/INVOICE MODAL */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <ReceiptText className="w-5 h-5" />
                {T.supplierAccounts.invoiceModalTitle}
              </div>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvoiceSubmit} className="p-6 space-y-4">
              <p className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
                {T.supplierAccounts.invoiceHint}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldInvoiceNo}</label>
                  <input
                    type="text"
                    value={invoiceForm.id}
                    onChange={e => setInvoiceForm({ ...invoiceForm, id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldDate}</label>
                  <input
                    type="date"
                    value={invoiceForm.date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldSupplierName}</label>
                <input
                  type="text"
                  placeholder={T.supplierAccounts.fieldSupplierNamePlaceholder}
                  value={invoiceForm.supplierName}
                  onChange={e => setInvoiceForm({ ...invoiceForm, supplierName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldInvoiceAmount}</label>
                <input
                  type="number"
                  min={1}
                  value={invoiceForm.amount}
                  onChange={e => setInvoiceForm({ ...invoiceForm, amount: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-3 py-2 text-base text-amber-300 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  placeholder={T.supplierAccounts.invoiceNotesPlaceholder}
                  value={invoiceForm.notes}
                  onChange={e => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  {T.supplierAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-950/50 flex items-center gap-2"
                >
                  {submitting ? T.supplierAccounts.saving : T.supplierAccounts.invoiceSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEDUCT-FROM-ADVANCE BOX
          The manual drawdown: pick a delivery, take its cost off the advance
          the supplier is holding. */}
      {isDeductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-blue-900/70 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-blue-300 font-bold text-lg">
                <ShieldCheck className="w-5 h-5" />
                {T.supplierAccounts.deductModalTitle}
              </div>
              <button
                onClick={() => setIsDeductModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between bg-blue-950/30 border border-blue-900/60 rounded-xl px-4 py-3">
                <div>
                  <div className="text-xs text-blue-300/80">{T.supplierAccounts.deductAvailableLabel}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{deductSupplier}</div>
                </div>
                <div className="text-2xl font-bold text-blue-300 font-mono">
                  {availableAdvance.toLocaleString()} <span className="text-sm font-normal text-blue-500">{T.common.currency}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">{T.supplierAccounts.deductHint}</p>

              {loadingDeduct ? (
                <div className="p-8 text-center text-slate-400 text-sm">{T.supplierAccounts.statementLoading}</div>
              ) : availableAdvance <= 0 ? (
                <div className="p-8 text-center text-amber-400 text-sm">{T.supplierAccounts.deductNoAdvance}</div>
              ) : deductItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">{T.supplierAccounts.deductNoItems}</div>
              ) : (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-700">
                      <tr>
                        <th className="p-2.5">{T.supplierAccounts.stmtColDate}</th>
                        <th className="p-2.5">{T.supplierAccounts.stmtColType}</th>
                        <th className="p-2.5">{T.supplierAccounts.stmtColId}</th>
                        <th className="p-2.5">{T.supplierAccounts.deductColRemaining}</th>
                        <th className="p-2.5">{T.supplierAccounts.deductColAmount}</th>
                        <th className="p-2.5 text-center">{T.supplierAccounts.deductColAction}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {deductItems.map(item => (
                        <tr key={item.id} className="hover:bg-slate-700/30">
                          <td className="p-2.5 font-mono text-slate-400">{item.date}</td>
                          <td className="p-2.5">
                            {item.type === 'resale' ? (
                              <span className="text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded">{T.supplierAccounts.typeResale}</span>
                            ) : (
                              <span className="text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">{T.supplierAccounts.typeInvoice}</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-slate-200">{item.id}</td>
                          <td className="p-2.5 font-mono text-amber-400">{item.remaining.toLocaleString()} {T.common.currency}</td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min={1}
                              max={Math.min(item.remaining, availableAdvance)}
                              value={deductAmounts[item.id] ?? 0}
                              onChange={e => setDeductAmounts(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                              className="w-32 bg-slate-900 border border-blue-800/60 rounded px-2 py-1 text-blue-200 font-mono"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => handleDeduct(item)}
                              disabled={
                                deductingId !== null ||
                                (deductAmounts[item.id] ?? 0) <= 0 ||
                                (deductAmounts[item.id] ?? 0) > Math.min(item.remaining, availableAdvance)
                              }
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-bold transition-colors"
                            >
                              {deductingId === item.id ? T.supplierAccounts.deducting : T.supplierAccounts.deductButton}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setIsDeductModalOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
              >
                {T.supplierAccounts.deductClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORRECT A RECORDED SUPPLIER PAYMENT
          Above the statement (z-60) because it is opened from inside it. */}
      {editingId && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <Pencil className="w-5 h-5" />
                {T.supplierAccounts.editModalTitle}
              </div>
              <button
                onClick={() => setEditingId(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <p className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
                {T.supplierAccounts.editHint}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={editingId}
                    disabled
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldDate}</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldSupplierName}</label>
                <input
                  type="text"
                  value={editForm.supplierName}
                  onChange={e => setEditForm({ ...editForm, supplierName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldAmount}</label>
                  <input
                    type="number"
                    min={1}
                    value={editForm.amount}
                    onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-3 py-2 text-base text-amber-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldPaymentType}</label>
                  <select
                    value={editForm.paymentType}
                    onChange={e => setEditForm({ ...editForm, paymentType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.supplierAccounts.paymentTypePrepay}>{T.supplierAccounts.paymentTypePrepay}</option>
                    <option value={T.supplierAccounts.paymentTypeRepay}>{T.supplierAccounts.paymentTypeRepay}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.supplierAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'auto'
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeSupplierEdit"
                        checked={editForm.allocationMode === 'auto'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'auto' })}
                        className="accent-emerald-500"
                      />
                      {T.supplierAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.supplierAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'none'
                      ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeSupplierEdit"
                        checked={editForm.allocationMode === 'none'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'none' })}
                        className="accent-blue-500"
                      />
                      {T.supplierAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.supplierAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  {T.supplierAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-950/50"
                >
                  {submitting ? T.supplierAccounts.editSaving : T.supplierAccounts.editSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CORRECT A RECORDED DEBT/INVOICE
          Above the statement (z-60) because it is opened from inside it. */}
      {editingInvoiceId && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <ReceiptText className="w-5 h-5" />
                {T.supplierAccounts.editInvoiceTitle}
              </div>
              <button
                onClick={() => setEditingInvoiceId(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditInvoiceSubmit} className="p-6 space-y-4">
              <p className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">
                {T.supplierAccounts.editInvoiceHint}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldInvoiceNo}</label>
                  <input
                    type="text"
                    value={editingInvoiceId}
                    disabled
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldDate}</label>
                  <input
                    type="date"
                    value={editInvoiceForm.date}
                    onChange={e => setEditInvoiceForm({ ...editInvoiceForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldSupplierName}</label>
                <input
                  type="text"
                  value={editInvoiceForm.supplierName}
                  onChange={e => setEditInvoiceForm({ ...editInvoiceForm, supplierName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldInvoiceAmount}</label>
                <input
                  type="number"
                  min={1}
                  value={editInvoiceForm.amount}
                  onChange={e => setEditInvoiceForm({ ...editInvoiceForm, amount: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-amber-700/60 rounded-lg px-3 py-2 text-base text-amber-300 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.supplierAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  value={editInvoiceForm.notes}
                  onChange={e => setEditInvoiceForm({ ...editInvoiceForm, notes: e.target.value })}
                  placeholder={T.supplierAccounts.invoiceNotesPlaceholder}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingInvoiceId(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  {T.supplierAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-950/50"
                >
                  {submitting ? T.supplierAccounts.editSaving : T.supplierAccounts.editInvoiceSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STATEMENT MODAL */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex dialog-scroll justify-center p-4 no-print">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800/80">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <FileText className="w-5 h-5" />
                {T.supplierAccounts.statementTitle} <span className="text-slate-100">{statementData?.supplierName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  {T.supplierAccounts.printButton}
                </button>
                <button
                  onClick={() => setIsStatementModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-200">
              {loadingStatement ? (
                <div className="p-12 text-center text-slate-400">{T.supplierAccounts.statementLoading}</div>
              ) : !statementData ? (
                <div className="p-12 text-center text-slate-400">{T.supplierAccounts.statementEmpty}</div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div>
                      <div className="text-xs text-slate-400">{T.supplierAccounts.stmtTotalOwed}</div>
                      <div className="text-lg font-bold text-slate-100">{statementData.summary.totalOwed.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.supplierAccounts.stmtTotalPaid}</div>
                      <div className="text-lg font-bold text-emerald-400">{statementData.summary.totalPaymentsGiven.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.supplierAccounts.stmtDebt}</div>
                      <div className="text-lg font-bold text-amber-400">{statementData.summary.outstandingDebt.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.supplierAccounts.stmtPrepaid}</div>
                      <div className="text-lg font-bold text-blue-400">{statementData.summary.prepaidBalance.toLocaleString()} {T.common.currency}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <Factory className="w-4 h-4 text-cyan-400" />
                      {T.supplierAccounts.stmtItemsHeading(statementData.itemized.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.supplierAccounts.stmtColDate}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColType}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColId}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColDescription}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColLoad}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColOwed}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColPaid}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColRemaining}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtColActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.itemized.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-slate-400">{item.date}</td>
                              <td className="p-2.5 font-medium">
                                {item.type === 'resale' ? (
                                  <span className="text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded">{T.supplierAccounts.typeResale}</span>
                                ) : (
                                  <span className="text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">{T.supplierAccounts.typeInvoice}</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-200">{item.id}</td>
                              <td className="p-2.5">{item.description || '—'}</td>
                              <td className="p-2.5">{item.type === 'resale' ? `${item.totalTonnage} ${item.quantityUnit}` : '—'}</td>
                              <td className="p-2.5 font-mono font-bold">{item.owed.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono text-emerald-400">{item.paid.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono font-semibold">
                                {item.remaining > 0 ? (
                                  <span className="text-amber-400">{item.remaining.toLocaleString()} {T.common.currency}</span>
                                ) : (
                                  <span className="text-emerald-400">0 {T.common.currency}</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                {/* Shipment rows belong to the resale record and are
                                    corrected there; only manual debts are editable here. */}
                                {item.type === 'invoice' ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => openEditForInvoice(item, statementData.supplierName)}
                                      title={T.supplierAccounts.editInvoiceAction}
                                      className="p-1.5 rounded-lg bg-amber-950/40 text-amber-400 hover:bg-amber-900/60 border border-amber-900/60"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteInvoice(item, statementData.supplierName)}
                                      title={T.supplierAccounts.deleteInvoiceAction}
                                      className="p-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/60"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <CreditCard className="w-4 h-4 text-cyan-400" />
                      {T.supplierAccounts.stmtPaymentsHeading(statementData.payments.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColReceipt}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColDate}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColType}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColAmount}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColNotes}</th>
                            <th className="p-2.5">{T.supplierAccounts.stmtPayColActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-500">{T.supplierAccounts.stmtNoPayments}</td>
                            </tr>
                          ) : (
                            statementData.payments.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="p-2.5 font-mono font-bold text-cyan-300">{p.id}</td>
                                <td className="p-2.5 font-mono text-slate-400">{p.date}</td>
                                <td className="p-2.5 font-medium">{p.paymentType}</td>
                                <td className="p-2.5 font-mono font-bold text-emerald-400">{p.amount.toLocaleString()} {T.common.currency}</td>
                                <td className="p-2.5 text-slate-400">{p.notes || '-'}</td>
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => openEditForPayment(p, statementData.supplierName)}
                                      title={T.supplierAccounts.editPaymentAction}
                                      className="p-1.5 rounded-lg bg-amber-950/40 text-amber-400 hover:bg-amber-900/60 border border-amber-900/60"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePayment(p, statementData.supplierName)}
                                      title={T.supplierAccounts.deletePaymentAction}
                                      className="p-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/60"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN PRINTABLE SUPPLIER STATEMENT — rendered only on window.print()
          via @media print CSS. Portaled to document.body: this component is
          mounted inside the app's "no-print" wrapper, and a display:none
          ancestor hides descendants regardless of their own display rules, so
          the container must escape that subtree to be printable at all. */}
      {statementData && isStatementModalOpen && createPortal(
        <div className="hidden print-statement-container">
          <div style={{ maxWidth: '700px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '16px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px' }}>{T.brand.companyName}</h1>
              <p style={{ fontSize: '11px', margin: '0 0 4px', color: '#666' }}>{T.supplierAccounts.printTitle}</p>
              <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>{T.supplierAccounts.printSupplierLabel} {statementData.supplierName}</p>
              <p style={{ fontSize: '10px', margin: '4px 0 0', color: '#888' }}>{T.printCommon.printDateLabel} {new Date().toLocaleDateString('ar-DZ')}</p>
            </div>

            <table style={{ width: '100%', marginBottom: '16px', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.supplierAccounts.printSummaryOwed}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalOwed.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.supplierAccounts.printSummaryPaid}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalPaymentsGiven.toLocaleString()} {T.common.currency}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.supplierAccounts.printSummaryDebt}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.outstandingDebt.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.supplierAccounts.printSummaryPrepaid}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.prepaidBalance.toLocaleString()} {T.common.currency}</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>{T.supplierAccounts.printItemsHeading(statementData.itemized.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.supplierAccounts.stmtColDate}</th>
                  <th>{T.supplierAccounts.printColType}</th>
                  <th>{T.supplierAccounts.printColId}</th>
                  <th>{T.supplierAccounts.stmtColDescription}</th>
                  <th>{T.supplierAccounts.printColOwed}</th>
                  <th>{T.supplierAccounts.printColPaid}</th>
                  <th>{T.supplierAccounts.printColRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.itemized.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.date}</td>
                    <td>{item.type === 'resale' ? T.supplierAccounts.typeResale : T.supplierAccounts.typeInvoice}</td>
                    <td>{item.id}</td>
                    <td>{item.description || '—'}</td>
                    <td>{item.owed.toLocaleString()} {T.common.currency}</td>
                    <td>{item.paid.toLocaleString()} {T.common.currency}</td>
                    <td style={{ fontWeight: item.remaining > 0 ? 'bold' : 'normal' }}>{item.remaining.toLocaleString()} {T.common.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '16px 0 6px' }}>{T.supplierAccounts.printPaymentsHeading(statementData.payments.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.supplierAccounts.stmtPayColReceipt}</th>
                  <th>{T.supplierAccounts.stmtPayColDate}</th>
                  <th>{T.supplierAccounts.stmtPayColType}</th>
                  <th>{T.supplierAccounts.stmtPayColAmount}</th>
                  <th>{T.supplierAccounts.stmtPayColNotes}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.payments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>{T.supplierAccounts.printNoPayments}</td></tr>
                ) : (
                  statementData.payments.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.id}</td>
                      <td>{p.date}</td>
                      <td>{p.paymentType}</td>
                      <td>{p.amount.toLocaleString()} {T.common.currency}</td>
                      <td>{p.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '30px' }}>{T.supplierAccounts.printSignSupplier}</p>
                <div style={{ borderTop: '1px solid #999', width: '120px', margin: '0 auto' }}></div>
              </div>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '30px' }}>{T.printCommon.approvedBy}</p>
                <div style={{ borderTop: '1px solid #999', width: '120px', margin: '0 auto' }}></div>
                <p style={{ fontSize: '9px', marginTop: '4px', color: '#888' }}>{T.brand.signatureName}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
