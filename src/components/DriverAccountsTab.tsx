/**
 * Driver Accounts & Settlements Tab Component
 * Manages driver wage earnings, settlements, advances, and Statements of Account
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../strings';
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
  Truck,
  UserCheck,
  ShieldAlert,
  Pencil,
  Trash2,
  ExternalLink
} from 'lucide-react';
import type { DriverSummary, DriverStatement, TabFilters } from '../types';
import { fetchDriverStatement, fetchNextDriverPaymentId } from '../api/client';

interface DriverAccountsTabProps {
  summaries: DriverSummary[];
  loading: boolean;
  filters: TabFilters;
  onRecordPayment: (payload: any) => Promise<any>;
  onUpdatePayment: (id: string, payload: any) => Promise<any>;
  onDeletePayment: (id: string) => Promise<any>;
  /** Opens the trip/resale record itself in the main edit form. */
  onEditTrip: (type: 'transport' | 'resale', id: string) => void;
  onRefreshTrips: () => void;
}

export function DriverAccountsTab({
  summaries,
  loading,
  filters,
  onRecordPayment,
  onUpdatePayment,
  onDeletePayment,
  onEditTrip,
  onRefreshTrips
}: DriverAccountsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementData, setStatementData] = useState<DriverStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Form State for Recording Driver Payout
  const [payoutForm, setPayoutForm] = useState({
    id: '',
    date: new Date().toISOString().split('T')[0],
    driverName: '',
    amount: 50000,
    paymentType: T.driverAccounts.payoutTypeSettlement,
    notes: '',
    allocationMode: 'auto' as 'auto' | 'manual' | 'none',
  });

  const [submitting, setSubmitting] = useState(false);

  // Correcting a payment already recorded. editingId doubles as "the edit
  // dialog is open", and holds which receipt is being corrected.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    driverName: '',
    amount: 0,
    paymentType: '',
    notes: '',
    allocationMode: 'auto' as 'auto' | 'none',
  });

  // Open Payout Modal for a specific driver
  const openPayoutForDriver = async (driverName: string) => {
    try {
      const nextId = await fetchNextDriverPaymentId();
      setPayoutForm(prev => ({
        ...prev,
        id: nextId,
        driverName,
        date: new Date().toISOString().split('T')[0],
        amount: 50000,
        allocationMode: 'auto'
      }));
      setIsPaymentModalOpen(true);
    } catch (e) {
      console.error('Failed to get next driver payout ID:', e);
    }
  };

  // Open Statement Modal for a driver
  const openStatementForDriver = async (driverName: string) => {
    setLoadingStatement(true);
    setIsStatementModalOpen(true);
    try {
      const data = await fetchDriverStatement(driverName);
      setStatementData(data);
    } catch (e) {
      console.error('Failed to load driver statement:', e);
    } finally {
      setLoadingStatement(false);
    }
  };

  // Submit Payout
  /** Open the correction dialog prefilled with the payment as recorded. */
  const openEditForPayment = (p: DriverStatement['payments'][number], driverName: string) => {
    setEditForm({
      date: p.date,
      driverName,
      amount: p.amount,
      paymentType: p.paymentType || T.driverAccounts.payoutTypeSettlement,
      notes: p.notes || '',
      // Re-spreading is the norm; the operator can switch it back to an
      // advance if that is what the payment really was.
      // A payment that was never applied is an advance; keep it one unless
      // the owner deliberately switches to auto.
      allocationMode: p.allocatedAmount > 0 ? 'auto' : 'none',
    });
    setEditingId(p.id);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm.driverName || editForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onUpdatePayment(editingId, {
        date: editForm.date,
        driverName: editForm.driverName,
        amount: Number(editForm.amount),
        paymentType: editForm.paymentType,
        notes: editForm.notes,
        allocationMode: editForm.allocationMode,
      });
      setEditingId(null);
      // The statement is open behind this dialog — refresh it so the
      // corrected figures replace the old ones immediately.
      await openStatementForDriver(editForm.driverName);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.driverAccounts.editError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayment = async (p: DriverStatement['payments'][number], driverName: string) => {
    if (!confirm(T.driverAccounts.deleteConfirm(p.id, p.amount.toLocaleString()))) return;
    try {
      await onDeletePayment(p.id);
      await openStatementForDriver(driverName);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.driverAccounts.deleteError(err.message));
    }
  };

  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutForm.driverName || payoutForm.amount <= 0) return;
    setSubmitting(true);
    try {
      await onRecordPayment({
        id: payoutForm.id,
        date: payoutForm.date,
        driverName: payoutForm.driverName,
        amount: Number(payoutForm.amount),
        paymentType: payoutForm.paymentType,
        notes: payoutForm.notes,
        allocationMode: payoutForm.allocationMode,
      });
      setIsPaymentModalOpen(false);
      onRefreshTrips();
    } catch (err: any) {
      alert(T.driverAccounts.saveError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      const query = (searchTerm || filters.searchQuery || '').toLowerCase().trim();
      if (!query) return true;
      return s.driverName.toLowerCase().includes(query);
    });
  }, [summaries, searchTerm, filters.searchQuery]);

  // Grand Totals across all drivers
  const grandTotals = useMemo(() => {
    return summaries.reduce(
      (acc, curr) => ({
        earned: acc.earned + curr.totalEarned,
        paid: acc.paid + curr.totalPaymentsGiven,
        payable: acc.payable + curr.outstandingPayable,
        advance: acc.advance + curr.advanceBalance
      }),
      { earned: 0, paid: 0, payable: 0, advance: 0 }
    );
  }, [summaries]);


  /** Print with the party's name as the document title, so the saved PDF is
   *  named after the statement rather than after the application. */
  const printStatement = () => {
    const originalTitle = document.title;
    const party = statementData?.driverName;
    if (party) document.title = `${T.printCommon.statementFilePrefix}-${party}`;
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
  };

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-1">
            <span>{T.driverAccounts.kpiEarned}</span>
            <Truck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">
            {grandTotals.earned.toLocaleString()} <span className="text-xs font-normal text-slate-400">{T.common.currency}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">{T.driverAccounts.kpiEarnedHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-emerald-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400 text-sm font-medium mb-1">
            <span>{T.driverAccounts.kpiPaid}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300">
            {grandTotals.paid.toLocaleString()} <span className="text-xs font-normal text-emerald-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-emerald-500/80 mt-1">{T.driverAccounts.kpiPaidHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-amber-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-400 text-sm font-medium mb-1">
            <span>{T.driverAccounts.kpiPayable}</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {grandTotals.payable.toLocaleString()} <span className="text-xs font-normal text-amber-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-amber-500/80 mt-1">{T.driverAccounts.kpiPayableHint}</div>
        </div>

        <div className="bg-slate-800/80 border border-purple-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-purple-400 text-sm font-medium mb-1">
            <span>{T.driverAccounts.kpiAdvance}</span>
            <UserCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300">
            {grandTotals.advance.toLocaleString()} <span className="text-xs font-normal text-purple-500">{T.common.currency}</span>
          </div>
          <div className="text-xs text-purple-400/80 mt-1">{T.driverAccounts.kpiAdvanceHint}</div>
        </div>
      </div>

      {/* Control bar & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={T.driverAccounts.searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={() => {
            if (filteredSummaries.length > 0) {
              openPayoutForDriver(filteredSummaries[0].driverName);
            } else {
              openPayoutForDriver('');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-950/40"
        >
          <Plus className="w-4 h-4" />
          {T.driverAccounts.recordPayoutButton}
        </button>
      </div>

      {/* Driver Accounts Table */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-4">{T.driverAccounts.colName}</th>
                <th className="p-4">{T.driverAccounts.colEarned}</th>
                <th className="p-4">{T.driverAccounts.colPaid}</th>
                <th className="p-4">{T.driverAccounts.colPayable}</th>
                <th className="p-4">{T.driverAccounts.colAdvance}</th>
                <th className="p-4">{T.driverAccounts.colTripCount}</th>
                <th className="p-4 text-center">{T.driverAccounts.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.driverAccounts.loading}
                  </td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {T.driverAccounts.empty}
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="p-4 font-semibold text-slate-100 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center font-bold text-xs">
                        {s.driverName.charAt(0)}
                      </div>
                      {s.driverName}
                    </td>
                    <td className="p-4 font-mono font-medium text-slate-200">
                      {s.totalEarned.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold text-emerald-400">
                      {s.totalPaymentsGiven.toLocaleString()} {T.common.currency}
                    </td>
                    <td className="p-4 font-mono font-semibold">
                      {s.outstandingPayable > 0 ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded text-xs">
                          {s.outstandingPayable.toLocaleString()} {T.common.currency}
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs font-normal">{T.driverAccounts.fullySettled}</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      {s.advanceBalance > 0 ? (
                        <span className="text-purple-400 bg-purple-950/40 border border-purple-800 px-2 py-0.5 rounded text-xs font-semibold">
                          +{s.advanceBalance.toLocaleString()} {T.common.currency} {T.driverAccounts.advanceSuffix}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">0 {T.common.currency}</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-300">
                      <span className="font-bold text-slate-100">{s.totalTripsCount}</span> {T.driverAccounts.tripCountCell(s.unpaidTripsCount)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openPayoutForDriver(s.driverName)}
                          className="px-3 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {T.driverAccounts.payoutAction}
                        </button>
                        <button
                          onClick={() => openStatementForDriver(s.driverName)}
                          className="px-3 py-1.5 bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {T.driverAccounts.statementAction}
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

      {/* RECORD DRIVER PAYOUT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <CreditCard className="w-5 h-5" />
                {T.driverAccounts.payoutModalTitle}
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePayoutSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={payoutForm.id}
                    onChange={e => setPayoutForm({ ...payoutForm, id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldDate}</label>
                  <input
                    type="date"
                    value={payoutForm.date}
                    onChange={e => setPayoutForm({ ...payoutForm, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldDriverName}</label>
                <input
                  type="text"
                  placeholder={T.driverAccounts.fieldDriverNamePlaceholder}
                  value={payoutForm.driverName}
                  onChange={e => setPayoutForm({ ...payoutForm, driverName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldAmount}</label>
                  <input
                    type="number"
                    min={1}
                    value={payoutForm.amount}
                    onChange={e => setPayoutForm({ ...payoutForm, amount: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-cyan-700/60 rounded-lg px-3 py-2 text-base text-cyan-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldPayoutType}</label>
                  <select
                    value={payoutForm.paymentType}
                    onChange={e => setPayoutForm({ ...payoutForm, paymentType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.driverAccounts.payoutTypeSettlement}>{T.driverAccounts.payoutTypeSettlement}</option>
                    <option value={T.driverAccounts.payoutTypeAdvance}>{T.driverAccounts.payoutTypeAdvance}</option>
                    <option value={T.driverAccounts.payoutTypeBonus}>{T.driverAccounts.payoutTypeBonus}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.driverAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    payoutForm.allocationMode === 'auto'
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeDriver"
                        checked={payoutForm.allocationMode === 'auto'}
                        onChange={() => setPayoutForm({ ...payoutForm, allocationMode: 'auto' })}
                        className="accent-cyan-500"
                      />
                      {T.driverAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.driverAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    payoutForm.allocationMode === 'none'
                      ? 'bg-purple-950/40 border-purple-500 text-purple-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeDriver"
                        checked={payoutForm.allocationMode === 'none'}
                        onChange={() => setPayoutForm({ ...payoutForm, allocationMode: 'none' })}
                        className="accent-purple-500"
                      />
                      {T.driverAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.driverAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldNotes}</label>
                <textarea
                  rows={2}
                  placeholder={T.driverAccounts.fieldNotesPlaceholder}
                  value={payoutForm.notes}
                  onChange={e => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  {T.driverAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-950/50 flex items-center gap-2"
                >
                  {submitting ? T.driverAccounts.saving : T.driverAccounts.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CORRECT A RECORDED PAYMENT
          Sits above the statement (z-60) because it is opened from inside it. */}
      {editingId && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex dialog-scroll justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <Pencil className="w-5 h-5" />
                {T.driverAccounts.editModalTitle}
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
                {T.driverAccounts.editHint}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldReceiptNo}</label>
                  <input
                    type="text"
                    value={editingId}
                    disabled
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldDate}</label>
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
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldDriverName}</label>
                <input
                  type="text"
                  value={editForm.driverName}
                  onChange={e => setEditForm({ ...editForm, driverName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldAmount}</label>
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldPayoutType}</label>
                  <select
                    value={editForm.paymentType}
                    onChange={e => setEditForm({ ...editForm, paymentType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value={T.driverAccounts.payoutTypeSettlement}>{T.driverAccounts.payoutTypeSettlement}</option>
                    <option value={T.driverAccounts.payoutTypeAdvance}>{T.driverAccounts.payoutTypeAdvance}</option>
                    <option value={T.driverAccounts.payoutTypeBonus}>{T.driverAccounts.payoutTypeBonus}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">{T.driverAccounts.allocationLabel}</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'auto'
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeDriverEdit"
                        checked={editForm.allocationMode === 'auto'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'auto' })}
                        className="accent-cyan-500"
                      />
                      {T.driverAccounts.allocationAuto}
                    </div>
                    <span className="text-[11px] opacity-80">{T.driverAccounts.allocationAutoHint}</span>
                  </label>

                  <label className={`p-3 border rounded-xl cursor-pointer flex flex-col gap-1 transition-all ${
                    editForm.allocationMode === 'none'
                      ? 'bg-purple-950/40 border-purple-500 text-purple-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <input
                        type="radio"
                        name="allocModeDriverEdit"
                        checked={editForm.allocationMode === 'none'}
                        onChange={() => setEditForm({ ...editForm, allocationMode: 'none' })}
                        className="accent-purple-500"
                      />
                      {T.driverAccounts.allocationNone}
                    </div>
                    <span className="text-[11px] opacity-80">{T.driverAccounts.allocationNoneHint}</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">{T.driverAccounts.fieldNotes}</label>
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
                  {T.driverAccounts.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-amber-950/50"
                >
                  {submitting ? T.driverAccounts.editSaving : T.driverAccounts.editSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRIVER STATEMENT MODAL */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex dialog-scroll justify-center p-4 no-print">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800/80">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <FileText className="w-5 h-5" />
                {T.driverAccounts.statementTitle} <span className="text-slate-100">{statementData?.driverName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={printStatement}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  {T.driverAccounts.printButton}
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
                <div className="p-12 text-center text-slate-400">{T.driverAccounts.statementLoading}</div>
              ) : !statementData ? (
                <div className="p-12 text-center text-slate-400">{T.driverAccounts.statementEmpty}</div>
              ) : (
                <>
                  {/* Statement Summary Cards */}
                  <div className="grid grid-cols-4 gap-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div>
                      <div className="text-xs text-slate-400">{T.driverAccounts.stmtTotalEarned}</div>
                      <div className="text-lg font-bold text-slate-100">{statementData.summary.totalEarned.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.driverAccounts.stmtTotalPaid}</div>
                      <div className="text-lg font-bold text-emerald-400">{statementData.summary.totalPaymentsGiven.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.driverAccounts.stmtOutstanding}</div>
                      <div className="text-lg font-bold text-amber-400">{statementData.summary.outstandingPayable.toLocaleString()} {T.common.currency}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">{T.driverAccounts.stmtAdvance}</div>
                      <div className="text-lg font-bold text-purple-400">{statementData.summary.advanceBalance.toLocaleString()} {T.common.currency}</div>
                    </div>
                  </div>

                  {/* Section 1: Itemized Trips */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <Truck className="w-4 h-4 text-cyan-400" />
                      {T.driverAccounts.stmtTripsHeading(statementData.itemizedTrips.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.driverAccounts.stmtColDate}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColType}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColId}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColClientDest}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColLoad}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColEarned}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColPaid}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColRemaining}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.itemizedTrips.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-slate-400">{item.date}</td>
                              <td className="p-2.5 font-medium">
                                {item.type === 'transport' ? (
                                  <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">{T.driverAccounts.typeTransport}</span>
                                ) : (
                                  <span className="text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded">{T.driverAccounts.typeResale}</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-200">{item.id}</td>
                              <td className="p-2.5">{item.clientName} ➔ {item.destination}</td>
                              <td className="p-2.5">{item.totalTonnage} {item.quantityUnit}</td>
                              <td className="p-2.5 font-mono font-bold text-cyan-300">{item.driverEarned.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono text-emerald-400">{item.driverPaid.toLocaleString()} {T.common.currency}</td>
                              <td className="p-2.5 font-mono font-semibold">
                                {item.remaining > 0 ? (
                                  <span className="text-amber-400">{item.remaining.toLocaleString()} {T.common.currency}</span>
                                ) : (
                                  <span className="text-emerald-400">0 {T.common.currency}</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <button
                                  onClick={() => { setIsStatementModalOpen(false); onEditTrip(item.type, item.id); }}
                                  title={T.driverAccounts.editTripAction}
                                  className="p-1.5 rounded-lg bg-cyan-950/40 text-cyan-400 hover:bg-cyan-900/60 border border-cyan-900/60"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 2: Driver Payouts History */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <CreditCard className="w-4 h-4 text-cyan-400" />
                      {T.driverAccounts.stmtPayoutsHeading(statementData.payments.length)}
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">{T.driverAccounts.stmtPayColReceipt}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtColDate}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtPayColType}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtPayColAmount}</th>
                            <th className="p-2.5">{T.driverAccounts.stmtPayColNotes}</th>
                            <th className="p-2.5 text-center">{T.driverAccounts.stmtPayColActions}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-500">{T.driverAccounts.stmtNoPayouts}</td>
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
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => openEditForPayment(p, statementData.driverName)}
                                      title={T.driverAccounts.editPaymentAction}
                                      className="p-1.5 rounded bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePayment(p, statementData.driverName)}
                                      title={T.driverAccounts.deletePaymentAction}
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

      {/* HIDDEN PRINTABLE DRIVER STATEMENT — rendered only on window.print() via @media print CSS.
          Portaled to document.body: this component is mounted inside the app's
          "no-print" wrapper, and a `display:none` ancestor hides descendants
          regardless of their own display rules, so the container must escape
          that subtree to be printable at all. */}
      {statementData && isStatementModalOpen && createPortal(
        <div className="hidden print-statement-container">
          <div style={{ maxWidth: '700px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '16px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px' }}>{T.brand.companyName}</h1>
              <p style={{ fontSize: '11px', margin: '0 0 4px', color: '#666' }}>{T.driverAccounts.printTitle}</p>
              <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>{T.driverAccounts.printDriverLabel} {statementData.driverName}</p>
              <p style={{ fontSize: '10px', margin: '4px 0 0', color: '#888' }}>{T.printCommon.printDateLabel} {new Date().toLocaleDateString('ar-DZ')}</p>
            </div>

            <table style={{ width: '100%', marginBottom: '16px', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.driverAccounts.printSummaryEarned}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalEarned.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.driverAccounts.printSummaryPaid}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.totalPaymentsGiven.toLocaleString()} {T.common.currency}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.driverAccounts.printSummaryOutstanding}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.outstandingPayable.toLocaleString()} {T.common.currency}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>{T.driverAccounts.printSummaryAdvance}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #ccc' }}>{statementData.summary.advanceBalance.toLocaleString()} {T.common.currency}</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>{T.driverAccounts.printTripsHeading(statementData.itemizedTrips.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.driverAccounts.stmtColDate}</th>
                  <th>{T.driverAccounts.printColType}</th>
                  <th>{T.driverAccounts.printColId}</th>
                  <th>{T.driverAccounts.stmtColClientDest}</th>
                  <th>{T.driverAccounts.stmtColLoad}</th>
                  <th>{T.driverAccounts.printColEarned}</th>
                  <th>{T.driverAccounts.printColPaid}</th>
                  <th>{T.driverAccounts.printColRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.itemizedTrips.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.date}</td>
                    <td>{item.type === 'transport' ? T.driverAccounts.typeTransport : T.driverAccounts.printTypeResale}</td>
                    <td>{item.id}</td>
                    <td>{item.clientName} ← {item.destination}</td>
                    <td>{item.totalTonnage} {item.quantityUnit}</td>
                    <td>{item.driverEarned.toLocaleString()} {T.common.currency}</td>
                    <td>{item.driverPaid.toLocaleString()} {T.common.currency}</td>
                    <td style={{ fontWeight: item.remaining > 0 ? 'bold' : 'normal' }}>{item.remaining.toLocaleString()} {T.common.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ fontSize: '12px', fontWeight: 'bold', margin: '16px 0 6px' }}>{T.driverAccounts.printPayoutsHeading(statementData.payments.length)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{T.driverAccounts.stmtPayColReceipt}</th>
                  <th>{T.driverAccounts.stmtColDate}</th>
                  <th>{T.driverAccounts.stmtPayColType}</th>
                  <th>{T.driverAccounts.stmtPayColAmount}</th>
                  <th>{T.driverAccounts.stmtPayColNotes}</th>
                </tr>
              </thead>
              <tbody>
                {statementData.payments.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>{T.driverAccounts.printNoPayouts}</td></tr>
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
                <p style={{ fontWeight: 'bold', marginBottom: '30px' }}>{T.driverAccounts.printSignDriver}</p>
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
