/**
 * Client Accounts & Receivables Tab Component
 * Manages client pre-payments, batch payment allocations, and Statements of Account
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  CreditCard,
  Search,
  Plus,
  FileText,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  X,
  Printer,
  Calendar,
  Layers,
  Sparkles,
  ArrowDownRight,
  ShieldCheck,
  Pencil,
  Trash2
} from 'lucide-react';
import type { ClientSummary, ClientStatement, TabFilters } from '../types';
import { fetchClientStatement, fetchNextClientPaymentId } from '../api/client';
import { T } from '../strings';

interface ClientAccountsTabProps {
  summaries: ClientSummary[];
  loading: boolean;
  filters: TabFilters;
  onRecordPayment: (payload: any) => Promise<any>;
  onUpdatePayment: (id: string, payload: any) => Promise<any>;
  onDeletePayment: (id: string) => Promise<any>;
  onRefreshTrips: () => void;
}

export function ClientAccountsTab({
  summaries,
  loading,
  filters,
  onRecordPayment,
  onUpdatePayment,
  onDeletePayment,
  onRefreshTrips
}: ClientAccountsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementData, setStatementData] = useState<ClientStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Form State for Recording Payment
  const [paymentForm, setPaymentForm] = useState({
    id: '',
    date: new Date().toISOString().split('T')[0],
    clientName: '',
    amount: 100000,
    paymentMethod: T.clientAccounts.methodCash,
    notes: '',
    allocationMode: 'auto' as 'auto' | 'manual' | 'none',
  });

  const [submitting, setSubmitting] = useState(false);

  // Correcting a receipt already recorded. editingId doubles as "the edit
  // dialog is open", and holds which receipt is being corrected.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    clientName: '',
    amount: 0,
    paymentMethod: '',
    notes: '',
    allocationMode: 'auto' as 'auto' | 'none',
  });

  // Open Payment Modal for a specific client
  const openPaymentForClient = async (clientName: string) => {
    try {
      const nextId = await fetchNextClientPaymentId();
      setPaymentForm(prev => ({
        ...prev,
        id: nextId,
        clientName,
        date: new Date().toISOString().split('T')[0],
        amount: 100000,
        allocationMode: 'auto'
      }));
      setIsPaymentModalOpen(true);
    } catch (e) {
      console.error('Failed to get next payment ID:', e);
    }
  };

  // Open Statement Modal for a client
  /** Open the correction dialog prefilled with the receipt as recorded. */
  const openEditForPayment = (p: ClientStatement['payments'][number], clientName: string) => {
    setEditForm({
      date: p.date,
      clientName,
      amount: p.amount,
      paymentMethod: p.paymentMethod || T.clientAccounts.methodCash,
      notes: p.notes || '',
      // A payment that was never applied is an advance; keep it one unless
      // the owner deliberately switches to auto.
      allocationMode: p.allocatedAmount > 0 ? 'auto' : 'none',
    });
    setEditingId(p.id);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm.clientName || editForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onUpdatePayment(editingId, {
        date: editForm.date,
        clientName: editForm.clientName,
        amount: Number(editForm.amount),
        paymentMethod: editForm.paymentMethod,
        notes: editForm.notes,
        allocationMode: editForm.allocationMode,
      });
      setEditingId(null);
      // The statement is open behind this dialog — refresh it so the
      // corrected figures replace the old ones immediately.
      await openStatementForClient(editForm.clientName);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.clientAccounts.editError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayment = async (p: ClientStatement['payments'][number], clientName: string) => {
    if (!confirm(T.clientAccounts.deleteConfirm(p.id, p.amount.toLocaleString()))) return;
    try {
      await onDeletePayment(p.id);
      await openStatementForClient(clientName);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.clientAccounts.deleteError(err.message));
    }
  };

  const openStatementForClient = async (clientName: string) => {
    setLoadingStatement(true);
    setIsStatementModalOpen(true);
    try {
      const data = await fetchClientStatement(clientName);
      setStatementData(data);
    } catch (e) {
      console.error('Failed to load statement:', e);
    } finally {
      setLoadingStatement(false);
    }
  };

  // Submit Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.clientName || paymentForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onRecordPayment({
        id: paymentForm.id,
        date: paymentForm.date,
        clientName: paymentForm.clientName,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes,
        allocationMode: paymentForm.allocationMode,
      });
      setIsPaymentModalOpen(false);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.clientAccounts.saveError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      const query = (searchTerm || filters.searchQuery || '').toLowerCase().trim();
      if (!query) return true;
      return s.clientName.toLowerCase().includes(query);
    });
  }, [summaries, searchTerm, filters.searchQuery]);

  // Overall totals across all clients
  const grandTotals = useMemo(() => {
    return summaries.reduce(
      (acc, curr) => ({
        invoiced: acc.invoiced + curr.totalInvoiced,
        collected: acc.collected + curr.totalPaymentsReceived,
        receivables: acc.receivables + curr.outstandingReceivable,
        credit: acc.credit + curr.unallocatedCredit
      }),
      { invoiced: 0, collected: 0, receivables: 0, credit: 0 }
    );
  }, [summaries]);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-1">
            <span>{T.clientAccounts.kpiInvoiced}</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">
            {grandTotals.invoiced.toLocaleString()} <span className="text-xs font-normal text-slate-400">{T.common.currency}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">{T.clientAccounts.kpiInvoicedHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-emerald-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400 text-sm font-medium mb-1">
            <span>{T.clientAccounts.kpiCollected}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300">
            {grandTotals.collected.toLocaleString()} <span className="text-xs font-normal text-emerald-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-emerald-500/80 mt-1">{T.clientAccounts.kpiCollectedHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-amber-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-400 text-sm font-medium mb-1">
            <span>{T.clientAccounts.kpiOutstanding}</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {grandTotals.receivables.toLocaleString()} <span className="text-xs font-normal text-amber-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-amber-500/80 mt-1">{T.clientAccounts.kpiOutstandingHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-blue-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-400 text-sm font-medium mb-1">
            <span>{T.clientAccounts.kpiAdvance}</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-300">
            {grandTotals.credit.toLocaleString()} <span className="text-xs font-normal text-blue-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-blue-400/80 mt-1">{T.clientAccounts.kpiAdvanceHint}</div>
        </div>
      </div>

      {/* Control bar & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={T.clientAccounts.searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={() => {
            if (filteredSummaries.length > 0) {
              openPaymentForClient(filteredSummaries[0].clientName);
            } else {
              openPaymentForClient('');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          {T.clientAccounts.recordPaymentButton}
        </button>
      </div>

      {/* Client Accounts Table */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-4">{T.clientAccounts.colName}</th>
                <th className="p-4">{T.clientAccounts.colInvoiced}</th>
                <th className="p-4">{T.clientAccounts.colCollected}</th>
                <th className="p-4">{T.clientAccounts.colOutstanding}</th>
                <th className="p-4">{T.clientAccounts.colAdvance}</th>
                <th className="p-4">{T.clientAccounts.colTripCount}</th>
                <th className="p-4 text-center">{T.clientAccounts.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.clientAccounts.loading}
                  </td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.clientAccounts.empty}
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-4 font-semibold text-slate-100 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center font-bold text-xs">
                        {s.clientName.charAt(0)}
                      </div>
                      {s.clientName}
                    </td>
                    <td className="p-4 font-mono font-medium text-slate-200">
                      {s.totalInvoiced.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold text-emerald-400">
                      {s.totalPaymentsReceived.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold">
                      {s.outstandingReceivable > 0 ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded text-xs">
                          {s.outstandingReceivable.toLocaleString()} {T.common.currency}
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs font-normal">{T.clientAccounts.fullyPaid}</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      {s.unallocatedCredit > 0 ? (
                        <span className="text-blue-400 bg-blue-950/40 border border-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                          +{s.unallocatedCredit.toLocaleString()} {T.common.currency}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">0 {T.common.currency}</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-300">
                      <span className="font-bold text-slate-100">{s.totalTripsCount}</span> {T.clientAccounts.tripCountCell(s.unpaidTripsCount)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openPaymentForClient(s.clientName)}
                          className="px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {T.clientAccounts.addPaymentAction}
                        </button>
                        <button
                          onClick={() => openStatementForClient(s.clientName)}
                          className="px-3 py-1.5 bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {T.clientAccounts.statementAction}
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
                <CreditCard className="w-5 h-5" />
                {T.clientAccounts.paymentModalTitle}
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={paymentForm.id}
                    onChange={e => setPaymentForm({ ...paymentForm, id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldDate}</label>
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
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldClientName}</label>
                <input
                  type="text"
                  placeholder={T.clientAccounts.fieldClientNamePlaceholder}
                  value={paymentForm.clientName}
                  onChange={e => setPaymentForm({ ...paymentForm, clientName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldAmount}</label>
                  <input
                    type="number"
                    min={1}
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-emerald-700/60 rounded-lg px-3 py-2 text-base text-emerald-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldPaymentMethod}</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.clientAccounts.methodCash}>{T.clientAccounts.methodCash}</option>
                    <option value={T.clientAccounts.methodCheque}>{T.clientAccounts.methodCheque}</option>
                    <option value={T.clientAccounts.methodTransfer}>{T.clientAccounts.methodTransfer}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.clientAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    paymentForm.allocationMode === 'auto'
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocMode"
                        checked={paymentForm.allocationMode === 'auto'}
                        onChange={() => setPaymentForm({ ...paymentForm, allocationMode: 'auto' })}
                        className="accent-emerald-500"
                      />
                      {T.clientAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.clientAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    paymentForm.allocationMode === 'none'
                      ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocMode"
                        checked={paymentForm.allocationMode === 'none'}
                        onChange={() => setPaymentForm({ ...paymentForm, allocationMode: 'none' })}
                        className="accent-blue-500"
                      />
                      {T.clientAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.clientAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  placeholder={T.clientAccounts.fieldNotesPlaceholder}
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
                  {T.clientAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-2"
                >
                  {submitting ? T.clientAccounts.saving : T.clientAccounts.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CORRECT A RECORDED RECEIPT
          Sits above the statement (z-60) because it is opened from inside it. */}
      {editingId && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <Pencil className="w-5 h-5" />
                {T.clientAccounts.editModalTitle}
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
                {T.clientAccounts.editHint}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={editingId}
                    disabled
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldDate}</label>
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
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldClientName}</label>
                <input
                  type="text"
                  value={editForm.clientName}
                  onChange={e => setEditForm({ ...editForm, clientName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldAmount}</label>
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldPaymentMethod}</label>
                  <select
                    value={editForm.paymentMethod}
                    onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.clientAccounts.methodCash}>{T.clientAccounts.methodCash}</option>
                    <option value={T.clientAccounts.methodCheque}>{T.clientAccounts.methodCheque}</option>
                    <option value={T.clientAccounts.methodTransfer}>{T.clientAccounts.methodTransfer}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.clientAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'auto'
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeClientEdit"
                        checked={editForm.allocationMode === 'auto'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'auto' })}
                        className="accent-emerald-500"
                      />
                      {T.clientAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.clientAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'none'
                      ? 'bg-blue-950/40 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeClientEdit"
                        checked={editForm.allocationMode === 'none'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'none' })}
                        className="accent-blue-500"
                      />
                      {T.clientAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.clientAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.clientAccounts.fieldNotes}</label>
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
                  {T.clientAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-950/50"
                >
                  {submitting ? T.clientAccounts.editSaving : T.clientAccounts.editSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STATEMENT OF ACCOUNT MODAL */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800/80">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
                <FileText className="w-5 h-5" />
                {T.clientAccounts.statementTitle} <span className="text-slate-100">{statementData?.clientName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  {T.clientAccounts.printButton}
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
                <div className="p-12 text-center text-slate-400">{T.clientAccounts.statementLoading}</div>
              ) : !statementData ? (
                <div className="p-12 text-center text-slate-400">{T.clientAccounts.statementEmpty}</div>
              ) : (
                <>
                  {/* Statement Summary Cards */}
                  <div className="grid grid-cols-4 gap-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div>
                      <div className="text-xs text-slate-400">{T.clientAccounts.stmtTotalInvoiced}</div>
                      <div className="text-lg font-bold text-slate-100">{statementData.summary.totalInvoiced.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.clientAccounts.stmtTotalPaid}</div>
                      <div className="text-lg font-bold text-emerald-400">{statementData.summary.totalPaymentsReceived.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.clientAccounts.stmtOutstanding}</div>
                      <div className="text-lg font-bold text-amber-400">{statementData.summary.outstandingReceivable.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.clientAccounts.stmtAdvance}</div>
                      <div className="text-lg font-bold text-blue-400">{statementData.summary.unallocatedCredit.toLocaleString()} {T.common.currency}</div>
                    </div>
                  </div>

                  {/* Section 1: Itemized Trips & Resales */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      {T.clientAccounts.stmtTripsHeading(statementData.itemizedTrips.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.clientAccounts.stmtColDate}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColType}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColId}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColMaterialDest}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColLoad}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColTotalPrice}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColPaid}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColRemaining}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.itemizedTrips.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-slate-400">{item.date}</td>
                              <td className="p-2.5 font-medium">
                                {item.type === 'transport' ? (
                                  <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">{T.clientAccounts.typeTransport}</span>
                                ) : (
                                  <span className="text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded">{T.clientAccounts.typeResale}</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-200">{item.id}</td>
                              <td className="p-2.5">{item.materialType} ➔ {item.destination}</td>
                              <td className="p-2.5">{item.totalTonnage} {item.quantityUnit}</td>
                              <td className="p-2.5 font-mono font-bold">{item.totalPrice.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono text-emerald-400">{item.clientPaid.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono font-semibold">
                                {item.remaining > 0 ? (
                                  <span className="text-amber-400">{item.remaining.toLocaleString()} {T.common.currency}</span>
                                ) : (
                                  <span className="text-emerald-400">0 {T.common.currency}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 2: Payments History */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      {T.clientAccounts.stmtPaymentsHeading(statementData.payments.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.clientAccounts.stmtPayColReceipt}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtColDate}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtPayColMethod}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtPayColAmount}</th>
                            <th className="p-2.5">{T.clientAccounts.stmtPayColNotes}</th>
                            <th className="p-2.5 text-center">{T.clientAccounts.stmtPayColActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-500">{T.clientAccounts.stmtNoPayments}</td>
                            </tr>
                          ) : (
                            statementData.payments.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="p-2.5 font-mono font-bold text-emerald-300">{p.id}</td>
                                <td className="p-2.5 font-mono text-slate-400">{p.date}</td>
                                <td className="p-2.5">{p.paymentMethod}</td>
                                <td className="p-2.5 font-mono font-bold text-emerald-400">{p.amount.toLocaleString()} {T.common.currency}</td>
                                <td className="p-2.5 text-slate-400">{p.notes || '-'}</td>
                                <td className="p-2.5">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => openEditForPayment(p, statementData.clientName)}
                                      title={T.clientAccounts.editPaymentAction}
                                      className="p-1.5 rounded bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePayment(p, statementData.clientName)}
                                      title={T.clientAccounts.deletePaymentAction}
                                      className="p-1.5 rounded bg-rose-950/45 hover:bg-rose-900/40 text-rose-400 border border-rose-900/60 transition-colors"
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

      {/* HIDDEN PRINTABLE CLIENT STATEMENT — rendered only on window.print() via @media print CSS.
          Portaled to document.body: this component is mounted inside the app's
          "no-print" wrapper, and a `display:none` ancestor hides descendants
          regardless of their own display rules, so the container must escape
          that subtree to be printable at all. */}
      {statementData && isStatementModalOpen && createPortal(
        <div className="hidden print-statement-container">
          <div style={{ maxWidth: '700px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '16px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px' }}>{T.brand.companyName}</h1>
              <p style={{ fontSize: '11px', margin: '0 0 4px', color: '#666' }}>{T.clientAccounts.printTitle}</p>
              <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>{T.clientAccounts.printClientLabel} {statementData.clientName}</p>
              <p style={{ fontSize: '10px', margin: '4px 0 0', color: '#888' }}>{T.printCommon.printDateLabel} {new Date().toLocaleDateString('ar-DZ')}</p>
            </div>

            <table style={{ width: '100%', marginBottom: '16px', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.clientAccounts.printSummaryInvoiced}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalInvoiced.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.clientAccounts.printSummaryPaid}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalPaymentsReceived.toLocaleString()} {T.common.currency}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.clientAccounts.printSummaryOutstanding}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.outstandingReceivable.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.clientAccounts.printSummaryAdvance}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.unallocatedCredit.toLocaleString()} {T.common.currency}</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>{T.clientAccounts.printTripsHeading(statementData.itemizedTrips.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.clientAccounts.stmtColDate}</th>
                  <th>{T.clientAccounts.printColType}</th>
                  <th>{T.clientAccounts.printColId}</th>
                  <th>{T.clientAccounts.stmtColMaterialDest}</th>
                  <th>{T.clientAccounts.stmtColLoad}</th>
                  <th>{T.clientAccounts.stmtColTotalPrice}</th>
                  <th>{T.clientAccounts.stmtColPaid}</th>
                  <th>{T.clientAccounts.stmtColRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.itemizedTrips.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.date}</td>
                    <td>{item.type === 'transport' ? T.clientAccounts.printTypeTransport : T.clientAccounts.typeResale}</td>
                    <td>{item.id}</td>
                    <td>{item.materialType} ← {item.destination}</td>
                    <td>{item.totalTonnage} {item.quantityUnit}</td>
                    <td>{item.totalPrice.toLocaleString()} {T.common.currency}</td>
                    <td>{item.clientPaid.toLocaleString()} {T.common.currency}</td>
                    <td style={{ fontWeight: item.remaining > 0 ? 'bold' : 'normal' }}>{item.remaining.toLocaleString()} {T.common.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '16px 0 6px' }}>{T.clientAccounts.printPaymentsHeading(statementData.payments.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.clientAccounts.stmtPayColReceipt}</th>
                  <th>{T.clientAccounts.stmtColDate}</th>
                  <th>{T.clientAccounts.stmtPayColMethod}</th>
                  <th>{T.clientAccounts.stmtPayColAmount}</th>
                  <th>{T.clientAccounts.stmtPayColNotes}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.payments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>{T.clientAccounts.printNoPayments}</td></tr>
                ) : (
                  statementData.payments.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.id}</td>
                      <td>{p.date}</td>
                      <td>{p.paymentMethod}</td>
                      <td>{p.amount.toLocaleString()} {T.common.currency}</td>
                      <td>{p.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '30px' }}>{T.clientAccounts.printSignClient}</p>
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
