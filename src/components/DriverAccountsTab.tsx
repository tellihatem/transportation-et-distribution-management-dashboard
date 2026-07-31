/**
 * Driver Accounts & Settlements Tab Component
 * Manages driver wage earnings, settlements, advances, and Statements of Account
 */

import React, { useState, useMemo } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import type { DriverSummary, DriverStatement, TabFilters } from '../types';
import { fetchDriverStatement, fetchNextDriverPaymentId } from '../api/client';

interface DriverAccountsTabProps {
  summaries: DriverSummary[];
  loading: boolean;
  filters: TabFilters;
  onRecordPayment: (payload: any) => Promise<any>;
  onRefreshTrips: () => void;
}

export function DriverAccountsTab({
  summaries,
  loading,
  filters,
  onRecordPayment,
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
    paymentType: 'تصفية رحلات',
    notes: '',
    allocationMode: 'auto' as 'auto' | 'manual' | 'none',
  });

  const [submitting, setSubmitting] = useState(false);

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
      alert('خطأ أثناء تسوية مستحقات السائق: ' + err.message);
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

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-sm font-medium mb-1">
            <span>إجمالي أجور السائقين المستحقة</span>
            <Truck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">
            {grandTotals.earned.toLocaleString()} <span className="text-xs font-normal text-slate-400">دج</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">مجموع أجور الرحلات المنفذة</div>
        </div>

        <div className="bg-slate-800/80 border border-emerald-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400 text-sm font-medium mb-1">
            <span>إجمالي ما تم دفعه للسائقين</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-300">
            {grandTotals.paid.toLocaleString()} <span className="text-xs font-normal text-emerald-500">دج</span>
          </div>
          <div className="text-xs text-emerald-500/80 mt-1">مبالغ التصفيات والسلف المسلمة فعلياً</div>
        </div>

        <div className="bg-slate-800/80 border border-amber-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-400 text-sm font-medium mb-1">
            <span>مستحقات معلقة واجبة الدفع</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            {grandTotals.payable.toLocaleString()} <span className="text-xs font-normal text-amber-500">دج</span>
          </div>
          <div className="text-xs text-amber-500/80 mt-1">أجور رحلات غير مصفاة بعد</div>
        </div>

        <div className="bg-slate-800/80 border border-purple-900/40 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-purple-400 text-sm font-medium mb-1">
            <span>إجمالي سلف السائقين</span>
            <UserCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300">
            {grandTotals.advance.toLocaleString()} <span className="text-xs font-normal text-purple-500">دج</span>
          </div>
          <div className="text-xs text-purple-400/80 mt-1">دفعت كسلفة قبل تصفية الرحلات</div>
        </div>
      </div>

      {/* Control bar & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم السائق..."
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
          تصفية مستحقات / دفع دفعة لسائق
        </button>
      </div>

      {/* Driver Accounts Table */}
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-4">اسم السائق</th>
                <th className="p-4">إجمالي الأجور المستحقة</th>
                <th className="p-4">إجمالي المدفوع له</th>
                <th className="p-4">المستحق الحالي (دين الشركة)</th>
                <th className="p-4">رصيد السلفة</th>
                <th className="p-4">عدد الرحلات</th>
                <th className="p-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    جاري تحميل حسابات السائقين...
                  </td>
                </tr>
              ) : filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد بيانات حسابات سائقين تطابق البحث.
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
                      {s.totalEarned.toLocaleString()} دج
                    </td>
                    <td className="p-4 font-mono font-semibold text-emerald-400">
                      {s.totalPaymentsGiven.toLocaleString()} دج
                    </td>
                    <td className="p-4 font-mono font-semibold">
                      {s.outstandingPayable > 0 ? (
                        <span className="text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded text-xs">
                          {s.outstandingPayable.toLocaleString()} دج
                        </span>
                      ) : (
                        <span className="text-emerald-400 text-xs font-normal">مصفى بالكامل</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      {s.advanceBalance > 0 ? (
                        <span className="text-purple-400 bg-purple-950/40 border border-purple-800 px-2 py-0.5 rounded text-xs font-semibold">
                          +{s.advanceBalance.toLocaleString()} دج سلفة
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">0 دج</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-300">
                      <span className="font-bold text-slate-100">{s.totalTripsCount}</span> رحلة ({s.unpaidTripsCount} غير مصفاة)
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openPayoutForDriver(s.driverName)}
                          className="px-3 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          تصفية / دفع
                        </button>
                        <button
                          onClick={() => openStatementForDriver(s.driverName)}
                          className="px-3 py-1.5 bg-slate-700/70 hover:bg-slate-600 text-slate-200 border border-slate-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          كشف حساب
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-900/50">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <CreditCard className="w-5 h-5" />
                تصفية مستحقات / دفع للسائق
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">رقم الوصل</label>
                  <input
                    type="text"
                    value={payoutForm.id}
                    onChange={e => setPayoutForm({ ...payoutForm, id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">التاريخ</label>
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
                <label className="block text-xs font-medium text-slate-300 mb-1">اسم السائق</label>
                <input
                  type="text"
                  placeholder="أدخل اسم السائق"
                  value={payoutForm.driverName}
                  onChange={e => setPayoutForm({ ...payoutForm, driverName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">المبلغ المدفوع (دج)</label>
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">نوع الدفعة</label>
                  <select
                    value={payoutForm.paymentType}
                    onChange={e => setPayoutForm({ ...payoutForm, paymentType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="تصفية رحلات">تصفية رحلات</option>
                    <option value="سلفة">سلفة</option>
                    <option value="مكافأة">مكافأة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">طريقة تطبيق التصفية</label>
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
                      تلقائي (تصفية أقدم الرحلات)
                    </div>
                    <span className="text-[11px] opacity-80">تطبيق الدفعة لتصفية أجور الرحلات القديمة أولاً</span>
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
                      تسجيل كسلفة مسبقة
                    </div>
                    <span className="text-[11px] opacity-80">تسجيل المبلغ كسلفة على السائق دون تصفية رحلات سابقة</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">ملاحظات / تفاصيل</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات عن التصفية..."
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-cyan-950/50 flex items-center gap-2"
                >
                  {submitting ? 'جاري التسجيل...' : 'حفظ وتأكيد التصفية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRIVER STATEMENT MODAL */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl dir-rtl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800/80">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <FileText className="w-5 h-5" />
                كشف حساب أجور ومستحقات السائق: <span className="text-slate-100">{statementData?.driverName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الكشف
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
                <div className="p-12 text-center text-slate-400">جاري تحميل بيانات كشف حساب السائق...</div>
              ) : !statementData ? (
                <div className="p-12 text-center text-slate-400">لم يتم العثور على بيانات لهذا السائق.</div>
              ) : (
                <>
                  {/* Statement Summary Cards */}
                  <div className="grid grid-cols-4 gap-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div>
                      <div className="text-xs text-slate-400">إجمالي الأجور المستحقة</div>
                      <div className="text-lg font-bold text-slate-100">{statementData.summary.totalEarned.toLocaleString()} دج</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">إجمالي المدفوع له فعلياً</div>
                      <div className="text-lg font-bold text-emerald-400">{statementData.summary.totalPaymentsGiven.toLocaleString()} دج</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">المستحق المعلق (دين الشركة)</div>
                      <div className="text-lg font-bold text-amber-400">{statementData.summary.outstandingPayable.toLocaleString()} دج</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">رصيد السلفة المتبقي</div>
                      <div className="text-lg font-bold text-purple-400">{statementData.summary.advanceBalance.toLocaleString()} دج</div>
                    </div>
                  </div>

                  {/* Section 1: Itemized Trips */}
                  <div>
                    <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-2 text-sm">
                      <Truck className="w-4 h-4 text-cyan-400" />
                      سجل الرحلات والأجور المكتسبة ({statementData.itemizedTrips.length})
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">التاريخ</th>
                            <th className="p-2.5">نوع الرحلة</th>
                            <th className="p-2.5">رقم الرحلة</th>
                            <th className="p-2.5">العميل / الوجهة</th>
                            <th className="p-2.5">الحمولة</th>
                            <th className="p-2.5">حق السائق (الأجر)</th>
                            <th className="p-2.5">المدفوع له</th>
                            <th className="p-2.5">المتبقي له</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.itemizedTrips.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-slate-400">{item.date}</td>
                              <td className="p-2.5 font-medium">
                                {item.type === 'transport' ? (
                                  <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">نقل</span>
                                ) : (
                                  <span className="text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded">توصيل مواد</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-200">{item.id}</td>
                              <td className="p-2.5">{item.clientName} ➔ {item.destination}</td>
                              <td className="p-2.5">{item.totalTonnage} {item.quantityUnit}</td>
                              <td className="p-2.5 font-mono font-bold text-cyan-300">{item.driverEarned.toLocaleString()} دج</td>
                              <td className="p-2.5 font-mono text-emerald-400">{item.driverPaid.toLocaleString()} دج</td>
                              <td className="p-2.5 font-mono font-semibold">
                                {item.remaining > 0 ? (
                                  <span className="text-amber-400">{item.remaining.toLocaleString()} دج</span>
                                ) : (
                                  <span className="text-emerald-400">0 دج</span>
                                )}
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
                      سجل التصفيات والسلف المسلمة للسائق ({statementData.payments.length})
                    </h4>
                    <div className="border border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-2.5">رقم الوصل</th>
                            <th className="p-2.5">التاريخ</th>
                            <th className="p-2.5">نوع الدفعة</th>
                            <th className="p-2.5">المبلغ</th>
                            <th className="p-2.5">ملاحظات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {statementData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-500">لا توجد تصفيات أو سلف مسجلة بعد.</td>
                            </tr>
                          ) : (
                            statementData.payments.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="p-2.5 font-mono font-bold text-cyan-300">{p.id}</td>
                                <td className="p-2.5 font-mono text-slate-400">{p.date}</td>
                                <td className="p-2.5 font-medium">{p.paymentType}</td>
                                <td className="p-2.5 font-mono font-bold text-emerald-400">{p.amount.toLocaleString()} دج</td>
                                <td className="p-2.5 text-slate-400">{p.notes || '-'}</td>
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
    </div>
  );
}
