/**
 * Executive Overview / Master Financial Dashboard Component
 * Integrates all operational tabs into a unified, single-source-of-truth financial dashboard.
 */

import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Truck,
  Layers,
  CheckCircle2,
  AlertCircle,
  PiggyBank,
  Briefcase,
  ArrowUpRight,
  ShieldCheck,
  Percent,
  Compass
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import type { ClientTransportTrip, MaterialResaleTx, OtherExpense, ClientSummary, DriverSummary } from '../types';

interface ExecutiveOverviewTabProps {
  trips: ClientTransportTrip[];
  resales: MaterialResaleTx[];
  expenses: OtherExpense[];
  clientSummaries: ClientSummary[];
  driverSummaries: DriverSummary[];
  onNavigateTab: (tab: 'transport' | 'resale' | 'expenses' | 'clients' | 'drivers') => void;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export function ExecutiveOverviewTab({
  trips,
  resales,
  expenses,
  clientSummaries,
  driverSummaries,
  onNavigateTab
}: ExecutiveOverviewTabProps) {

  // Global Financial Calculations
  const metrics = useMemo(() => {
    // 1. Transport Trips
    let transportInvoiced = 0;
    let transportDriverWages = 0;
    let transportCompanyProfit = 0;
    let transportTons = 0;

    trips.forEach(t => {
      const fee = (t.truckCost || 0) + (t.driverCut || 0) + (t.companyProfit || 0);
      transportInvoiced += fee;
      transportDriverWages += (t.driverCut || 0);
      transportCompanyProfit += (t.companyProfit || 0);
      transportTons += (t.totalTonnage || 0);
    });

    // 2. Material Resales
    let resaleInvoiced = 0;
    let resaleSourcingCosts = 0;
    let resaleDriverWages = 0;
    let resaleLogisticsCosts = 0;
    let resaleTrueProfit = 0;
    let resaleTons = 0;

    resales.forEach(r => {
      const sourcingCost = (r.factoryPurchasePrice || 0) * (r.totalTonnage || 0);
      const visibleTransportFee = (r.truckCost || 0) + (r.driverCost || 0) + (r.explicitProfit || 0);
      const hiddenMargin = (r.clientSellingPrice || 0) - (sourcingCost + visibleTransportFee);
      const trueProfit = (r.explicitProfit || 0) + hiddenMargin;

      resaleInvoiced += (r.clientSellingPrice || 0);
      resaleSourcingCosts += sourcingCost;
      resaleDriverWages += (r.driverCost || 0);
      resaleLogisticsCosts += (r.truckCost || 0);
      resaleTrueProfit += trueProfit;
      resaleTons += (r.totalTonnage || 0);
    });

    // 3. Operational Expenses (Tab 3) - Fixed Burdens (Fuel, Maintenance, Admin, etc.)
    const totalOperationalBurdens = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // 4. Client Ledgers (Cash Collected & Receivables)
    const clientInvoicedTotal = clientSummaries.reduce((sum, c) => sum + c.totalInvoiced, 0);
    const clientCashCollected = clientSummaries.reduce((sum, c) => sum + c.totalPaymentsReceived, 0);
    const clientOutstandingReceivable = clientSummaries.reduce((sum, c) => sum + c.outstandingReceivable, 0);
    const clientAdvanceCredit = clientSummaries.reduce((sum, c) => sum + c.unallocatedCredit, 0);

    // 5. Driver Ledgers (Earned, Paid out, Payables)
    const driverWagesEarned = driverSummaries.reduce((sum, d) => sum + d.totalEarned, 0);
    const driverPayoutsGiven = driverSummaries.reduce((sum, d) => sum + d.totalPaymentsGiven, 0);
    const driverOutstandingPayable = driverSummaries.reduce((sum, d) => sum + d.outstandingPayable, 0);
    const driverAdvances = driverSummaries.reduce((sum, d) => sum + d.advanceBalance, 0);

    // Overall Combined Figures
    const grossInvoicedTurnover = transportInvoiced + resaleInvoiced;
    const grossDirectProfit = transportCompanyProfit + resaleTrueProfit;
    const netOperatingProfit = grossDirectProfit - totalOperationalBurdens;

    // Margin %
    const netProfitMarginPercent = grossInvoicedTurnover > 0 ? (netOperatingProfit / grossInvoicedTurnover) * 100 : 0;

    return {
      grossInvoicedTurnover,
      clientCashCollected,
      clientOutstandingReceivable,
      clientAdvanceCredit,

      driverWagesEarned,
      driverPayoutsGiven,
      driverOutstandingPayable,
      driverAdvances,

      totalOperationalBurdens,
      grossDirectProfit,
      netOperatingProfit,
      netProfitMarginPercent,

      transportTons,
      resaleTons,
      totalTons: transportTons + resaleTons
    };
  }, [trips, resales, expenses, clientSummaries, driverSummaries]);

  // Chart data: Monthly Cashflow comparison
  const cashflowChartData = useMemo(() => {
    return [
      { name: 'إجمالي المفتور', value: metrics.grossInvoicedTurnover, fill: '#3b82f6' },
      { name: 'المحصل نقداً', value: metrics.clientCashCollected, fill: '#10b981' },
      { name: 'ديون العملاء', value: metrics.clientOutstandingReceivable, fill: '#f59e0b' },
      { name: 'مدفوعات السائقين', value: metrics.driverPayoutsGiven, fill: '#06b6d4' },
      { name: 'مصاريف تشغيلية', value: metrics.totalOperationalBurdens, fill: '#ef4444' },
      { name: 'صافي الربح الفعلي', value: metrics.netOperatingProfit, fill: '#8b5cf6' },
    ];
  }, [metrics]);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Gross Invoiced & Cash Received */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
            <span>رقم الأعمال المفوتر</span>
            <DollarSign className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono">
            {metrics.grossInvoicedTurnover.toLocaleString()} <span className="text-sm font-normal text-slate-400">دج</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-400">المحصل نقداً:</span>
            <span className="font-bold text-emerald-400 font-mono">{metrics.clientCashCollected.toLocaleString()} دج</span>
          </div>
        </div>

        {/* Card 2: Net Operating Profit */}
        <div className="bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-800/60 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold mb-2">
            <span>صافي أرباح الشركة الفعلي</span>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-300 font-mono">
            {metrics.netOperatingProfit.toLocaleString()} <span className="text-sm font-normal text-emerald-500">دج</span>
          </div>
          <div className="mt-3 pt-3 border-t border-emerald-900/60 flex items-center justify-between text-xs">
            <span className="text-emerald-400/80">هامش الربح الصافي:</span>
            <span className="font-bold text-emerald-300 font-mono">{metrics.netProfitMarginPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 3: Client Receivables (Outstanding Debt) */}
        <div className="bg-slate-800/80 border border-amber-900/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold mb-2">
            <span>مستحقات عند العملاء (ديون)</span>
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-300 font-mono">
            {metrics.clientOutstandingReceivable.toLocaleString()} <span className="text-sm font-normal text-amber-500">دج</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-400">ودائع مسبقة (عربون):</span>
            <span className="font-bold text-blue-400 font-mono">+{metrics.clientAdvanceCredit.toLocaleString()} دج</span>
          </div>
        </div>

        {/* Card 4: Driver Payables */}
        <div className="bg-slate-800/80 border border-cyan-900/50 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-cyan-400 text-xs font-semibold mb-2">
            <span>مستحقات السائقين الواجبة</span>
            <Truck className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 font-mono">
            {metrics.driverOutstandingPayable.toLocaleString()} <span className="text-sm font-normal text-cyan-500">دج</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-400">سلف السائقين:</span>
            <span className="font-bold text-purple-400 font-mono">+{metrics.driverAdvances.toLocaleString()} دج</span>
          </div>
        </div>

      </div>

      {/* Main Charts & Visual Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Chart 1: Master Cashflow & Profit Distribution */}
        <div className="lg:col-span-2 bg-slate-800/70 border border-slate-700/60 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            مقارنة المؤشرات المالية والسيولة النقدية (دج)
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc' }}
                  formatter={(value: any) => [`${Number(value).toLocaleString()} دج`, 'المبلغ']}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {cashflowChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Operational Navigation & Shortcuts */}
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-2 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-cyan-400" />
              الوصول السريع لمهام الإدارة
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              الانتقال الفوري إلى التبويبات المتخصصة لإدارة العمليات والدفعات.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigateTab('clients')}
                className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-700/60 rounded-xl text-xs font-semibold text-slate-200 hover:text-emerald-300 transition-all group"
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  تسجيل دفعات وتصفية حسابات العملاء
                </span>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab('drivers')}
                className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-700 hover:border-cyan-700/60 rounded-xl text-xs font-semibold text-slate-200 hover:text-cyan-300 transition-all group"
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-cyan-400" />
                  تصفية أجور ومستحقات السائقين
                </span>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab('transport')}
                className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-slate-700/60 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all group"
              >
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  سجل رحلات نقل العملاء ({trips.length})
                </span>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200 transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab('resale')}
                className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-slate-700/60 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all group"
              >
                <span className="flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-purple-400" />
                  سجل عمليات بيع المواد ({resales.length})
                </span>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200 transition-colors" />
              </button>

              <button
                onClick={() => onNavigateTab('expenses')}
                className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-slate-700/60 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition-all group"
              >
                <span className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                  سجل الأعباء والمصاريف الأخرى ({expenses.length})
                </span>
                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200 transition-colors" />
              </button>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-[11px] text-emerald-300/90 leading-relaxed">
            💡 <strong>نظام متكامل بدون تكرار:</strong> جميع التبويبات مرتبطة تلقائياً بالدفاتر المالية لتفادي الازدواجية في الدفع وضمان دقة التقارير.
          </div>
        </div>

      </div>
    </div>
  );
}
