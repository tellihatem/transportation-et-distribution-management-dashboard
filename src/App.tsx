/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from "react";
import {
  Truck,
  Layers,
  TrendingUp,
  TrendingDown,
  Percent,
  TrendingUp as ProfitIcon,
  Plus,
  Trash2,
  Edit,
  Printer,
  Search,
  Calendar,
  X,
  CreditCard,
  DollarSign,
  Briefcase,
  AlertCircle,
  PiggyBank,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  Lock,
  Compass,
  MapPin,
  Tag,
  Download,
  Upload
} from "lucide-react";
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
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

import { ClientTransportTrip, MaterialResaleTx, OtherExpense, TabFilters } from "./types";
import { TRANSLATE_EXPENSE_CATEGORY, EXPENSE_CATEGORIES } from "./data";
import { useTrips } from "./hooks/useTrips";
import { useResales } from "./hooks/useResales";
import { useExpenses } from "./hooks/useExpenses";
import { downloadBackup, importBackup } from "./api/client";
import logoUrl from "../assets/canvas.png";

// Algerian French-loanword month names, matching the receipt's existing date convention
const ALGERIAN_MONTHS = [
  "جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
  "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

function formatAlgerianDate(d: Date): string {
  return `${d.getDate()} ${ALGERIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getCurrentMonthRange(): { dateStart: string; dateEnd: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStart: `${year}-${pad(month + 1)}-01`,
    dateEnd: `${year}-${pad(month + 1)}-${pad(lastDay)}`
  };
}

export default function App() {
  // --- Search & Filters State ---
  const [filters, setFilters] = useState<TabFilters>({
    searchQuery: "",
    ...getCurrentMonthRange()
  });

  // Reset Filters to current month values
  const resetFilters = () => {
    setFilters({
      searchQuery: "",
      ...getCurrentMonthRange()
    });
  };

  // --- Backend-backed data (Express + SQLite, via /api) ---
  const { trips: clientTrips, error: tripsError, addTrip, editTrip, removeTrip } = useTrips(filters);
  const { resales: resaleTxs, error: resalesError, addResale, editResale, removeResale } = useResales(filters);
  const { expenses, error: expensesError, addExpense, editExpense, removeExpense } = useExpenses(filters);

  // --- Active Tab State ---
  // "transport" = Client Transport, "resale" = Material Resale, "expenses" = Other Expenses
  const [activeTab, setActiveTab] = useState<"transport" | "resale" | "expenses">("transport");

  // --- Modals State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");
  const [editRecordId, setEditRecordId] = useState<string | null>(null);

  // Print Receipt View Modal State
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    type: "transport" | "resale";
    data: any;
  } | null>(null);

  // --- Dynamic Form States for adding/editing records ---
  // State for Trip (Tab 1 Form)
  const [tripForm, setTripForm] = useState<Partial<ClientTransportTrip>>({
    id: "",
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    originFactory: "",
    destination: "",
    materialType: "",
    totalTonnage: 30,
    truckCost: 15000,
    driverCut: 5000,
    companyProfit: 5000
  });

  // State for Resale (Tab 2 Form)
  const [resaleForm, setResaleForm] = useState<Partial<MaterialResaleTx>>({
    id: "",
    date: new Date().toISOString().split("T")[0],
    endClient: "",
    factoryPurchasePrice: 1500,
    totalTonnage: 40,
    clientSellingPrice: 150000,
    truckCost: 18000,
    driverCost: 5000,
    explicitProfit: 8000
  });

  // State for Expense (Tab 3 Form)
  const [expenseForm, setExpenseForm] = useState<Partial<OtherExpense>>({
    id: "",
    date: new Date().toISOString().split("T")[0],
    category: "Fuel",
    truckPlate: "",
    amount: 15000,
    status: "Paid"
  });

  // Automatically compute Total Fee suggestion for Tab 1 as feedback in form
  const computedFormTotalTransportFee = (Number(tripForm.truckCost) || 0) + (Number(tripForm.driverCut) || 0) + (Number(tripForm.companyProfit) || 0);

  // Automatically compute True Profit feedback in Tab 2 Form
  const tempSourcingCost = (Number(resaleForm.factoryPurchasePrice) || 0) * (Number(resaleForm.totalTonnage) || 0);
  const tempVisibleTransport = (Number(resaleForm.truckCost) || 0) + (Number(resaleForm.driverCost) || 0) + (Number(resaleForm.explicitProfit) || 0);
  const tempHiddenMargin = (Number(resaleForm.clientSellingPrice) || 0) - (tempSourcingCost + tempVisibleTransport);
  const computedFormTotalTrueProfit = (Number(resaleForm.explicitProfit) || 0) + tempHiddenMargin;

  // --- Financial Calculations (Global Dashboard Cards) ---
  // Filtered Client Transport records
  const filteredClientTrips = useMemo(() => {
    return clientTrips.filter(t => {
      const matchSearch = !filters.searchQuery ||
        t.clientName.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        t.destination.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        t.originFactory.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        t.materialType.toLowerCase().includes(filters.searchQuery.toLowerCase());

      const matchDate = (!filters.dateStart || t.date >= filters.dateStart) &&
        (!filters.dateEnd || t.date <= filters.dateEnd);
      return matchSearch && matchDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [clientTrips, filters]);

  // Filtered Material Resales
  const filteredResaleTxs = useMemo(() => {
    return resaleTxs.filter(tx => {
      const matchSearch = !filters.searchQuery ||
        tx.endClient.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        tx.id.toLowerCase().includes(filters.searchQuery.toLowerCase());

      const matchDate = (!filters.dateStart || tx.date >= filters.dateStart) &&
        (!filters.dateEnd || tx.date <= filters.dateEnd);
      return matchSearch && matchDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [resaleTxs, filters]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchedCategoryLabel = TRANSLATE_EXPENSE_CATEGORY[exp.category] || exp.category;
      const matchSearch = !filters.searchQuery ||
        exp.id.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        exp.truckPlate.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        matchedCategoryLabel.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        exp.category.toLowerCase().includes(filters.searchQuery.toLowerCase());

      const matchDate = (!filters.dateStart || exp.date >= filters.dateStart) &&
        (!filters.dateEnd || exp.date <= filters.dateEnd);
      return matchSearch && matchDate;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, filters]);

  // --- Master Financial Formulas Calculations ---
  // Tab 1 Profits
  const tab1Stats = useMemo(() => {
    let grossRevenue = 0; // Total transport fee = truck cost + driver cut + company profit
    let driverPayout = 0;
    let netMargin = 0; // Company Profit
    let totalTons = 0;

    filteredClientTrips.forEach(trip => {
      const tripFee = trip.truckCost + trip.driverCut + trip.companyProfit;
      grossRevenue += tripFee;
      driverPayout += trip.driverCut;
      netMargin += trip.companyProfit;
      totalTons += trip.totalTonnage;
    });

    return { grossRevenue, driverPayout, netMargin, totalTons };
  }, [filteredClientTrips]);

  // Tab 2 Profits
  const tab2Stats = useMemo(() => {
    let tradingTurnover = 0; // client selling price
    let capitalOutlay = 0;    // purchase price * tonnage
    let totalTrueProfit = 0;
    let totalTons = 0;

    filteredResaleTxs.forEach(tx => {
      const sourcingCost = tx.factoryPurchasePrice * tx.totalTonnage;
      const visibleTransportFee = tx.truckCost + tx.driverCost + tx.explicitProfit;
      const hiddenMargin = tx.clientSellingPrice - (sourcingCost + visibleTransportFee);
      const trueProfit = tx.explicitProfit + hiddenMargin;

      tradingTurnover += tx.clientSellingPrice;
      capitalOutlay += sourcingCost;
      totalTrueProfit += trueProfit;
      totalTons += tx.totalTonnage;
    });

    return { tradingTurnover, capitalOutlay, totalTrueProfit, totalTons };
  }, [filteredResaleTxs]);

  // Tab 3 Expenses
  const tab3Stats = useMemo(() => {
    let totalOverhead = 0;
    let categoryBreakdown: Record<string, number> = {};

    filteredExpenses.forEach(exp => {
      totalOverhead += exp.amount;
      categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + exp.amount;
    });

    return { totalOverhead, categoryBreakdown };
  }, [filteredExpenses]);

  // Global Net Cashflow: Net Cashflow = (Tab 1 Company Profit + Tab 2 Total True Profit) - Tab 3 Total Expenses
  const masterNetCashflow = (tab1Stats.netMargin + tab2Stats.totalTrueProfit) - tab3Stats.totalOverhead;

  // --- Add / Edit Records Logic ---
  const handleOpenAdd = () => {
    setModalType("add");
    setEditRecordId(null);
    if (activeTab === "transport") {
      setTripForm({
        id: `TR-${Math.floor(100 + Math.random() * 900)}`,
        date: new Date().toISOString().split("T")[0],
        clientName: "",
        originFactory: "",
        destination: "",
        materialType: "",
        totalTonnage: 32,
        truckCost: 15000,
        driverCut: 5000,
        companyProfit: 6000
      });
    } else if (activeTab === "resale") {
      setResaleForm({
        id: `RS-${Math.floor(800 + Math.random() * 200)}`,
        date: new Date().toISOString().split("T")[0],
        endClient: "",
        factoryPurchasePrice: 1500,
        totalTonnage: 40,
        clientSellingPrice: 180000,
        truckCost: 18000,
        driverCost: 5000,
        explicitProfit: 8000
      });
    } else {
      setExpenseForm({
        id: `EXP-${Math.floor(100 + Math.random() * 900)}`,
        date: new Date().toISOString().split("T")[0],
        category: "Fuel",
        truckPlate: "",
        amount: 15000,
        status: "Paid"
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: any) => {
    setModalType("edit");
    setEditRecordId(record.id);
    if (activeTab === "transport") {
      setTripForm({ ...record });
    } else if (activeTab === "resale") {
      setResaleForm({ ...record });
    } else {
      setExpenseForm({ ...record });
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السجل بشكل نهائي؟")) return;
    try {
      if (activeTab === "transport") {
        await removeTrip(id);
      } else if (activeTab === "resale") {
        await removeResale(id);
      } else {
        await removeExpense(id);
      }
    } catch (err: any) {
      alert(`تعذر حذف السجل: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === "transport") {
        const data: ClientTransportTrip = {
          id: tripForm.id || `TR-${Date.now().toString().slice(-4)}`,
          date: tripForm.date || "",
          clientName: tripForm.clientName || "",
          originFactory: tripForm.originFactory || "",
          destination: tripForm.destination || "",
          materialType: tripForm.materialType || "",
          totalTonnage: Number(tripForm.totalTonnage) || 0,
          truckCost: Number(tripForm.truckCost) || 0,
          driverCut: Number(tripForm.driverCut) || 0,
          companyProfit: Number(tripForm.companyProfit) || 0
        };

        if (modalType === "add") {
          await addTrip(data);
        } else {
          await editTrip(editRecordId!, data);
        }
      } else if (activeTab === "resale") {
        const data: MaterialResaleTx = {
          id: resaleForm.id || `RS-${Date.now().toString().slice(-4)}`,
          date: resaleForm.date || "",
          endClient: resaleForm.endClient || "",
          factoryPurchasePrice: Number(resaleForm.factoryPurchasePrice) || 0,
          totalTonnage: Number(resaleForm.totalTonnage) || 0,
          clientSellingPrice: Number(resaleForm.clientSellingPrice) || 0,
          truckCost: Number(resaleForm.truckCost) || 0,
          driverCost: Number(resaleForm.driverCost) || 0,
          explicitProfit: Number(resaleForm.explicitProfit) || 0
        };

        if (modalType === "add") {
          await addResale(data);
        } else {
          await editResale(editRecordId!, data);
        }
      } else {
        const data: OtherExpense = {
          id: expenseForm.id || `EXP-${Date.now().toString().slice(-4)}`,
          date: expenseForm.date || "",
          category: expenseForm.category || "Fuel",
          truckPlate: expenseForm.truckPlate || "عام مجهول",
          amount: Number(expenseForm.amount) || 0,
          status: expenseForm.status as 'Paid' | 'Pending' || "Paid"
        };

        if (modalType === "add") {
          await addExpense(data);
        } else {
          await editExpense(editRecordId!, data);
        }
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(`تعذر حفظ السجل: ${err.message}`);
    }
  };

  // --- Local printable formatted Receipt Generator ---
  const handleOpenReceipt = (type: "transport" | "resale", record: any) => {
    setSelectedReceipt({ type, data: record });
    setIsReceiptOpen(true);
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    if (selectedReceipt) {
      document.title = `وصل-${selectedReceipt.data.id}`;
    }
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  };

  // --- Local database backup export/import ---
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    downloadBackup();
  };

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!window.confirm("سيؤدي الاستيراد إلى استبدال جميع البيانات الحالية في قاعدة البيانات بالكامل بمحتوى الملف المحدد. هل تريد المتابعة؟")) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importBackup(parsed);
      const { client_trips = 0, material_resales = 0, expenses: expensesCount = 0 } = result.imported;
      alert(`تم الاستيراد بنجاح:\n${client_trips} رحلة نقل، ${material_resales} عملية إعادة بيع، ${expensesCount} مصروف.\nسيتم إعادة تحميل الصفحة الآن.`);
      window.location.reload();
    } catch (err: any) {
      alert(`فشل استيراد النسخة الاحتياطية: ${err.message}`);
    }
  };

  // Stacked chart data formatting for Tab 1 Cost breakdown
  const tab1ChartData = useMemo(() => {
    return filteredClientTrips.slice(0, 10).map(trip => ({
      name: trip.id,
      "تكلفة الشاحنة (Truck Cost)": trip.truckCost,
      "مستحقات السائق (Driver Cut)": trip.driverCut,
      "هامش الشركة (Company Profit)": trip.companyProfit,
    })).reverse();
  }, [filteredClientTrips]);

  // Chart data for Tab 2 sourcing vs resale combo comparison
  const tab2ChartData = useMemo(() => {
    return filteredResaleTxs.slice(0, 10).map(tx => {
      const sourcingCost = tx.factoryPurchasePrice * tx.totalTonnage;
      return {
        name: tx.id,
        "تكلفة شراء المادة (Sourcing Cost)": sourcingCost,
        "سعر البيع النهائي (Selling Combo)": tx.clientSellingPrice,
        "إجمالي الربح الفعلي (True Profit)": tx.explicitProfit + (tx.clientSellingPrice - (sourcingCost + tx.truckCost + tx.driverCost + tx.explicitProfit))
      };
    }).reverse();
  }, [filteredResaleTxs]);

  // Tab 3 Pie Chart breakdown
  const expensePieData = useMemo(() => {
    return Object.entries(tab3Stats.categoryBreakdown).map(([category, amount]) => ({
      name: TRANSLATE_EXPENSE_CATEGORY[category] || category,
      value: amount
    }));
  }, [tab3Stats]);

  const PIE_COLORS = ["#2563eb", "#3b82f6", "#22c55e", "#ef4444", "#eab308"];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white" dir="rtl">

      {/* CSS stylesheet injection to handle Print receipts precisely on browser */}
      <style>{`
        @media print {
          body, #root, #root > div {
            background-color: white !important;
            color: black !important;
            font-size: 11px !important;
            min-height: 0 !important;
          }
          /* Hide everything else. (Not "body > *": the print container lives
             nested inside the same root div as the rest of the app, so hiding
             the root itself would hide the print container too.) */
          .no-print {
            display: none !important;
          }
          /* Force block render of printable receipt wrapper */
          .print-receipt-container {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            direction: rtl !important;
            padding: 24px !important;
            color: black !important;
            background: white !important;
          }
          .print-receipt-container * {
            visibility: visible !important;
            color: black !important;
          }
          .recharts-responsive-container {
            width: 100% !important;
            height: 300px !important;
          }
        }
      `}</style>

      {/* OFFLINE EMBEDDED DUST PRINT PREVIEW ELEMENT (Only displays on actual browser print operation) */}
      {selectedReceipt && (
        <div className="hidden print-receipt-container">
          <div className="max-w-2xl mx-auto border-2 border-dashed border-slate-400 p-8 rounded-lg bg-white text-black space-y-6">
            <div className="flex justify-between items-center border-b-2 border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="Company Logo" className="h-16 w-16 object-contain shrink-0" />
                <div>
                  <h1 className="text-2xl font-bold font-display text-slate-950">نقل وتوزيع البضائع لعلوي عبد المالك</h1>
                  <p className="text-xs text-slate-500">فاتورة رسمية</p>
                  <p className="text-xs text-slate-600">التاريخ الحالي للنظام: {formatAlgerianDate(new Date())}</p>
                </div>
              </div>
              <div className="text-left">
                <div className="bg-slate-200 text-slate-900 border border-slate-400 px-4 py-2 font-mono text-lg font-bold rounded">
                  {selectedReceipt.data.id}
                </div>
                <p className="text-xs text-slate-500 mt-1">تاريخ النقل: {selectedReceipt.data.date}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-600">
                    {selectedReceipt.type === "transport" ? "اسم العميل:" : "الزبون النهائي:"}
                  </span>{" "}
                  <strong className="text-slate-900">
                    {selectedReceipt.type === "transport" ? selectedReceipt.data.clientName : selectedReceipt.data.endClient}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-600">الإجمالي بالوزن:</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} طن</strong>
                </div>
                {selectedReceipt.type === "transport" && (
                  <>
                    <div>
                      <span className="text-slate-600">المادة المشحونة:</span>{" "}
                      <strong className="text-slate-900">{selectedReceipt.data.materialType}</strong>
                    </div>
                    <div>
                      <span className="text-slate-600">منشأ الشحنة:</span>{" "}
                      <strong className="text-slate-900">{selectedReceipt.data.originFactory}</strong>
                    </div>
                    <div>
                      <span className="text-slate-600">الوجهة المستهدفة:</span>{" "}
                      <strong className="text-slate-900">{selectedReceipt.data.destination}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-slate-100 border-2 border-slate-800 rounded-lg p-6 flex justify-between items-center">
              <span className="text-base font-bold text-slate-900">المبلغ الإجمالي الواجب دفعه</span>
              <span className="text-2xl font-mono font-bold text-slate-950">
                {(
                  selectedReceipt.type === "transport"
                    ? selectedReceipt.data.truckCost + selectedReceipt.data.driverCut + selectedReceipt.data.companyProfit
                    : selectedReceipt.data.clientSellingPrice
                ).toLocaleString()} دج
              </span>
            </div>

            <div className="border-t border-slate-800 pt-8 flex justify-between text-xs">
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">توقيع السائق والمسؤول</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
              </div>
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">إمضاء وختم العميل</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
              </div>
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">صادق عليها من المحلل المالي</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
                <p className="font-mono text-[10px] text-slate-500 mt-1">Lalaoui A. / Bilal R.</p>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 border-t border-slate-200 pt-4 font-mono">
              وصل شحن محمي للنظام الداخلي - لا يتطلب ختم السحابة الإلكترونية
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL WRAPPER: NAVIGATION & BODY */}
      <div className="no-print pb-20">
        {/* TOP COMPREHENSIVE HEADER WITH BILINGUAL GRAPHICS */}
        <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-xl backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/10">
                  <img src={logoUrl} alt="Company Logo" width={60} height={60} className="object-contain" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight font-display bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2">
                    <span>نقل وتوزيع البضائع لعلوي عبد المالك</span>
                    <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-sans tracking-wide">بيئة آمنة</span>
                  </h1>
                  <p className="text-xs text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                    <Compass className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span>مراقبة وتدقيق تكاليف الشحن، الأرباح المستترة، ومصاريف الأسطول البري</span>
                  </p>
                </div>
              </div>

              {/* Status Indicator & Offline Badge */}
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col text-left px-3 py-1 bg-slate-800 border border-slate-700/80 rounded-lg text-xs leading-tight">
                  <span className="text-slate-400 font-sans text-right">المسؤول</span>
                  <span className="text-white font-mono font-bold">السيد لعلوي عبد المالك</span>
                </div>

                <button
                  onClick={handleExportBackup}
                  title="تصدير نسخة احتياطية من قاعدة البيانات"
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">تصدير نسخة احتياطية</span>
                </button>
                <button
                  onClick={handleImportClick}
                  title="استيراد نسخة احتياطية إلى قاعدة البيانات"
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">استيراد نسخة احتياطية</span>
                </button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />

                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>متصل بقاعدة البيانات المباشرة</span>
                </div>
              </div>

            </div>
          </div>
        </header>

        {/* MASTER FINANCIAL FORMULA DECK - HIGHEST VISUAL HIERARCHY */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">

            {/* Ambient background blur circles */}
            <div className="absolute top-1/2 left-0 -translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-cyan-600/5 blur-3xl pointer-events-none"></div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">

              {/* Formula Blueprint Breakdown */}
              <div className="lg:col-span-8 space-y-4">
                <div className="inline-flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-3 py-1 rounded-lg text-xs">
                  <Tag className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-bold text-slate-300">المركزي الشامل للميزانية والتدفقات النقدية</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold text-white font-display">
                  معادلة صافي التدفق المالي للشركة (Company Net Cashflow)
                </h2>

                {/* Mathematical visual schema */}
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">مجموع أرباح الشحن (تبويب 1)</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab1Stats.netMargin.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">+</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">أرباح تجارة المواد المشروعة (تبويب 2)</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab2Stats.totalTrueProfit.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">-</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">المصاريف والأعباء التشغيلية (تبويب 3)</span>
                    <span className="text-rose-400 font-bold font-mono">-{tab3Stats.totalOverhead.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-500 font-bold text-lg">=</span>
                  <div className="bg-slate-800/40 px-3 py-1 rounded border border-slate-700 flex flex-col">
                    <span className="text-[10px] text-cyan-400 font-bold">صافي النقد المحقق للشركة</span>
                    <span className={`font-mono font-bold text-base ${masterNetCashflow >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                      {masterNetCashflow.toLocaleString()} دج
                    </span>
                  </div>
                </div>
              </div>

              {/* High impact visualization counter */}
              <div className="lg:col-span-4 bg-[#1e293b]/50 border border-slate-800 rounded-2xl p-5 text-center flex flex-col justify-center items-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">إجمالي التدفق المالي الصافي الحالي</p>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-4xl font-black font-mono tracking-tight ${masterNetCashflow >= 0 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(34,197,94,0.2)]' : 'text-rose-500'}`}>
                    {masterNetCashflow.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-400">دج</span>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 py-1 px-3.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  {masterNetCashflow >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <span>الموازنة في حالة كفاءة وربحية إيجابية</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-rose-400 animate-bounce" />
                      <span className="text-rose-300">المصاريف تتخطى هوامش الربح الحالية</span>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* INTERACTIVE FILTERS & TABS NAV PANEL */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">

            {/* Search/Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">

              <div className="relative flex-1 sm:w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث سريع برقم السند، الجهة، أو اسِم العميل..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                  className="w-full pl-3 pr-10 py-2 bg-slate-950 border border-slate-800 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100"
                />
              </div>

              {/* Date Filters */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.dateStart}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateStart: e.target.value }))}
                  className="px-2 py-1.5 bg-slate-950 border border-slate-800 text-xs rounded-lg text-slate-300"
                />
                <span className="text-slate-500 text-xs">إلى</span>
                <input
                  type="date"
                  value={filters.dateEnd}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateEnd: e.target.value }))}
                  className="px-2 py-1.5 bg-slate-950 border border-slate-800 text-xs rounded-lg text-slate-300"
                />
              </div>

              {/* Reset filter button */}
              <button
                onClick={resetFilters}
                className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700/80 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                title="إعادة تعيين إلى جوان 2026"
              >
                مسح التصفية
              </button>

            </div>

            {/* TAB CONTROLLERS */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">

              <button
                onClick={() => { setActiveTab("transport"); resetFilters(); }}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "transport"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Truck className="h-3.5 w-3.5" />
                <span>شحن لصالح العملاء</span>
              </button>

              <button
                onClick={() => { setActiveTab("resale"); resetFilters(); }}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "resale"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>شراء ونقل ومستتر</span>
              </button>

              <button
                onClick={() => { setActiveTab("expenses"); resetFilters(); }}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "expenses"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>المصاريف الأخرى الأسطول</span>
              </button>

            </div>

          </div>
        </section>

        {/* CONTAINER CONTENT ACCORDING TO TABS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <AnimatePresence mode="wait">

            {/* TAB 1: CLIENT TRANSPORT (شحن لصالح العملاء) */}
            {activeTab === "transport" && (
              <motion.div
                key="tab-transport"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">عدد الرحلات الجارية (Total Trips)</span>
                    <span className="text-3xl font-black font-mono text-blue-400 block mt-1">{filteredClientTrips.length}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">رحلة مرصودة للعملاء الفعليين</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">إجمالي الإيرادات (Gross Revenue)</span>
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab1Stats.grossRevenue.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">تكلفة الشحن الكلية المحتسبة للعميل</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">مستحقات السائقين (Driver Payouts)</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">{tab1Stats.driverPayout.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">حفّز السداد المباشر لقنوات السائقين</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">الربح الصافي للشركة (Net Margin)</span>
                      <PiggyBank className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-cyan-300 block mt-1">{tab1Stats.netMargin.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">الهامش الباقي لخزانة المؤسسة</span>
                  </div>
                </div>

                {/* Sub-visual details: Stacked cost split chart & action bar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* Cost Split stacked bar chart */}
                  <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">توزيع التكلفة الصافي لكل رحلة</h4>
                      <p className="text-[10px] text-slate-400 mb-4">أشرطة تظهر انقسام العوائد بين الشاحنة، السائق وهامش المؤسسة</p>
                    </div>

                    <div className="h-60 w-full relative">
                      {tab1ChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">لا توجد بيانات مخطط كافية للفلترة</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={tab1ChartData} layout="vertical" margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                            <XAxis type="number" stroke="#64748b" fontSize={9} />
                            <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={9} width={45} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                            <Bar dataKey="تكلفة الشاحنة (Truck Cost)" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="مستحقات السائق (Driver Cut)" stackId="a" fill="#10b981" />
                            <Bar dataKey="هامش الشركة (Company Profit)" stackId="a" fill="#06b6d4" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="flex gap-2 text-[10px] text-slate-400 mt-4 justify-around bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
                        <span>شاحنات</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                        <span>سائقين</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#06b6d4]"></span>
                        <span>أرباح الشركة</span>
                      </div>
                    </div>
                  </div>

                  {/* Shipment/Cargo Table Ledger */}
                  <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">تفاصيل الشحنات والمطالبات</h4>
                        <button
                          onClick={handleOpenAdd}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>تسجيل رحلة عميل</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">رقم السند</th>
                              <th className="p-3">التاريخ</th>
                              <th className="p-3">العميل والمادة</th>
                              <th className="p-3">تفاصيل النقل</th>
                              <th className="p-3">الحمولة بالطن</th>
                              <th className="p-3">التعريفة الإجمالية</th>
                              <th className="p-3 text-left">أدوات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredClientTrips.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">لا توجد سجلات رحلات مطابقة للتصفية الحالية.</td>
                              </tr>
                            ) : (
                              filteredClientTrips.map(trip => {
                                const totalCost = trip.truckCost + trip.driverCut + trip.companyProfit;
                                return (
                                  <tr key={trip.id} className="hover:bg-slate-800/40 transition">
                                    <td className="p-3 font-mono font-bold text-blue-400">{trip.id}</td>
                                    <td className="p-3 text-slate-300 font-mono">{trip.date}</td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{trip.clientName}</div>
                                      <div className="text-[10px] text-slate-400 mt-0.5">{trip.materialType}</div>
                                    </td>
                                    <td className="p-3 text-slate-300">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs">من:</span>
                                        <span className="text-slate-400">{trip.originFactory}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-cyan-400">إلى:</span>
                                        <span className="text-slate-400">{trip.destination}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 font-mono text-slate-100">{trip.totalTonnage} طن</td>
                                    <td className="p-3 font-mono font-bold text-emerald-400">{totalCost.toLocaleString()} دج</td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5 justify-end">

                                        <button
                                          onClick={() => handleOpenReceipt("transport", trip)}
                                          className="p-1 px-2.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 transition flex items-center gap-1"
                                          title="طباعة وتحميل الوصل المحلي والـ PDF"
                                        >
                                          <Printer className="h-3 w-3" />
                                          <span>وصل</span>
                                        </button>

                                        <button
                                          onClick={() => handleOpenEdit(trip)}
                                          className="p-1 rounded bg-slate-850 text-slate-300 border border-slate-700 hover:bg-slate-800 transition"
                                        >
                                          <Edit className="h-3.5 w-3.5" strokeWidth={2.5} />
                                        </button>

                                        <button
                                          onClick={() => handleDelete(trip.id)}
                                          className="p-1 rounded bg-rose-950/45 text-rose-400 border border-rose-900/60 hover:bg-rose-900/30 transition"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* TAB 2: MATERIAL RESALE (شراء وإعادة بيع المواد) */}
            {activeTab === "resale" && (
              <motion.div
                key="tab-resale"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">إجمالي مبيعات الزبائن (Turnover)</span>
                    <span className="text-3xl font-black font-mono text-cyan-400 block mt-1">{tab2Stats.tradingTurnover.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">حجم تعاملات التوريد الكلي للـ Materials</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">رأس المال والمشتريات (Capital Outlay)</span>
                      <TrendingDown className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab2Stats.capitalOutlay.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">القيمة المستحقة للمصنع لشراء المواد</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">نقل ظاهر صريح (Visible Freight)</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">
                      {filteredResaleTxs.reduce((sum, tx) => sum + tx.truckCost + tx.driverCost + tx.explicitProfit, 0).toLocaleString()} دج
                    </span>
                    <span className="text-[10px] text-slate-500">رسوم النقل المقيدة على المعاملة</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">إجمالي ربح المعاملة (True Profit)</span>
                      <ProfitIcon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab2Stats.totalTrueProfit.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-0.5 text-xs text-slate-300">
                      <Info className="h-3 w-3 inline text-emerald-400" />
                      <span>يشمل الكسب المستتر والهامش الظاهر</span>
                    </span>
                  </div>
                </div>

                {/* Sub-visual details for Trading Comparisons */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* Sourcing Cost vs Final selling Combo */}
                  <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">مقارنة كلفة السلع (Sourcing) بمقابل عوائد البيع (Selling)</h4>
                      <p className="text-[10px] text-slate-400 mb-4">يعكس بوضوح الكفاءة النقدية للشركة وإجمالي الكسب المستتر (Hidden Margins)</p>
                    </div>

                    <div className="h-64 w-full">
                      {tab2ChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">لا توجد بيانات كافية</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={tab2ChartData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                            <YAxis stroke="#64748b" fontSize={9} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                            <Bar dataKey="تكلفة شراء المادة (Sourcing Cost)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="سعر البيع النهائي (Selling Combo)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                            <Line type="monotone" dataKey="إجمالي الربح الفعلي (True Profit)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="flex gap-2 text-[10px] text-slate-500 mt-2 justify-around">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>كلفة الشراء</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>مبيعات التوريد</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span>عائد الأرباح الكلية</span>
                    </div>
                  </div>

                  {/* Resale ledger records */}
                  <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">إعادة بيع وتوريد السلع</h4>
                        <button
                          onClick={handleOpenAdd}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>تسجيل صفقة تجارية</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">رقم العملية</th>
                              <th className="p-3">التاريخ</th>
                              <th className="p-3">الزبون النهائي</th>
                              <th className="p-3">تفاصيل الأسعار</th>
                              <th className="p-3">مستتر (Hidden)</th>
                              <th className="p-3">إجمالي الكسب الحقيقي</th>
                              <th className="p-3 text-left">أدوات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredResaleTxs.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">لا توجد صفقات تجارية مسجلة.</td>
                              </tr>
                            ) : (
                              filteredResaleTxs.map(tx => {
                                const sourcingCost = tx.factoryPurchasePrice * tx.totalTonnage;
                                const visibleTransportFee = tx.truckCost + tx.driverCost + tx.explicitProfit;
                                const hiddenMargin = tx.clientSellingPrice - (sourcingCost + visibleTransportFee);
                                const totalTrueProfit = tx.explicitProfit + hiddenMargin;

                                return (
                                  <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                                    <td className="p-3 font-mono font-bold text-blue-400">{tx.id}</td>
                                    <td className="p-3 text-slate-300 font-mono">{tx.date}</td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{tx.endClient}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.totalTonnage} طن × {tx.factoryPurchasePrice} دج</div>
                                    </td>
                                    <td className="p-3 text-slate-300 font-mono">
                                      <div>البيع: {tx.clientSellingPrice.toLocaleString()}</div>
                                      <div className="text-[10px] text-slate-500">الكلفة: {sourcingCost.toLocaleString()}</div>
                                    </td>
                                    <td className={`p-3 font-mono font-semibold ${hiddenMargin >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                                      {hiddenMargin.toLocaleString()} دج
                                    </td>
                                    <td className="p-3 font-mono font-bold text-emerald-400">
                                      {totalTrueProfit.toLocaleString()} دج
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5 justify-end">

                                        <button
                                          onClick={() => handleOpenReceipt("resale", tx)}
                                          className="p-1 px-2 text-slate-300 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded transition flex items-center gap-1"
                                        >
                                          <Printer className="h-3 w-3" />
                                          <span>وصل</span>
                                        </button>

                                        <button
                                          onClick={() => handleOpenEdit(tx)}
                                          className="p-1 rounded bg-slate-850 text-slate-300 border border-slate-700 hover:bg-slate-800 transition"
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </button>

                                        <button
                                          onClick={() => handleDelete(tx.id)}
                                          className="p-1 rounded bg-rose-950/45 text-rose-400 border border-rose-900/60 hover:bg-rose-900/30 transition"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>

                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* TAB 3: OTHER EXPENSES (المصاريف الأخرى الأسطول) */}
            {activeTab === "expenses" && (
              <motion.div
                key="tab-expenses"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">سجلات الأعباء الكلية (Expense Items)</span>
                    <span className="text-3xl font-black font-mono text-rose-400 block mt-1">{filteredExpenses.length}</span>
                    <span className="text-[10px] text-slate-500">عمليّة صرف تشغيلية مسجلة</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">إجمالي المصاريف والمحروقات (Burn Rate)</span>
                    <span className="text-3xl font-black font-mono text-rose-500 block mt-1">{tab3Stats.totalOverhead.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-400">تدفق مالي هالك للرواتب وعقود الوقود</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">الأعباء المعلّقة (Pending Expenses)</span>
                    <span className="text-2xl font-black font-mono text-amber-500 block">
                      {filteredExpenses.filter(e => e.status === "Pending").reduce((sum, e) => sum + e.amount, 0).toLocaleString()} دج
                    </span>
                    <span className="text-[10px] text-slate-500">أعباء مستحقة لكن غير مدفوعة حالياً</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* Expense Breakdown Categories */}
                  <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">تقسيم النفقات التشغيلية</h4>
                      <p className="text-[10px] text-slate-400 mb-4">عرض مرئي للأعباء التي تم كبحها أو صرفها من الميزانية الكلية</p>
                    </div>

                    <div className="h-56 w-full relative flex items-center justify-center">
                      {expensePieData.length === 0 ? (
                        <div className="text-xs text-slate-500">لا توجد مصاريف مدفوعة للعرض</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expensePieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={38}
                              outerRadius={65}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {expensePieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-1.5 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[10px] text-slate-300">
                      {expensePieData.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-1.5 justify-between">
                          <div className="flex items-center gap-1 truncate max-w-[80px]">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></span>
                            <span className="truncate">{item.name}</span>
                          </div>
                          <span className="font-mono text-slate-400">({item.value.toLocaleString()} دج)</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Expenses Ledger */}
                  <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">جدول المصاريف والصيانات والأجور</h4>
                        <button
                          onClick={handleOpenAdd}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>إدراج سند أعباء</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">معرف المصرف</th>
                              <th className="p-3">تاريخ القيد</th>
                              <th className="p-3">الفئة والنوع</th>
                              <th className="p-3">رقم لوحة المركبة</th>
                              <th className="p-3">المبلغ المصروف</th>
                              <th className="p-3">الحالة النقدية</th>
                              <th className="p-3 text-left">أدوات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredExpenses.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">لا توجد مصاريف مقيدة.</td>
                              </tr>
                            ) : (
                              filteredExpenses.map(exp => (
                                <tr key={exp.id} className="hover:bg-slate-800/40 transition">
                                  <td className="p-3 font-mono font-bold text-rose-450 text-red-400">{exp.id}</td>
                                  <td className="p-3 text-slate-300 font-mono">{exp.date}</td>
                                  <td className="p-3 font-bold text-slate-100">
                                    {TRANSLATE_EXPENSE_CATEGORY[exp.category] || exp.category}
                                  </td>
                                  <td className="p-3 text-slate-400 font-mono">{exp.truckPlate}</td>
                                  <td className="p-3 font-mono font-bold text-rose-400">{exp.amount.toLocaleString()} دج</td>
                                  <td className="p-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${exp.status === "Paid"
                                      ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/65"
                                      : "bg-amber-900/40 text-amber-300 border border-amber-800"
                                      }`}>
                                      {exp.status === "Paid" ? "مدفوعة" : "معلّقة"}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-1.5 justify-end">
                                      <button
                                        onClick={() => handleOpenEdit(exp)}
                                        className="p-1 rounded bg-slate-850 text-slate-300 border border-slate-700 hover:bg-slate-800 transition"
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(exp.id)}
                                        className="p-1 rounded bg-rose-950/45 text-rose-400 border border-rose-900/60 hover:bg-rose-900/30 transition"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                              )
                            )}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  </div>

                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </section>

      </div>

      {/* RENDER MODAL: FOR ADD/EDIT WORKFLOW */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-2xl overflow-hidden p-6 shadow-2xl relative"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-5">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Truck className="h-4.5 w-4.5 text-blue-500" />
                  <span>
                    {modalType === "add" ? "إضافة قيد جديد" : "تحديث وتعديل القيد"}
                  </span>
                  <span className="text-xs font-normal text-slate-400">
                    ({activeTab === "transport" ? "شحن عميل" : activeTab === "resale" ? "تجارة وتوريد" : "أعباء ومصاريف"})
                  </span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* DYNAMIC FORMS ACCORDING TO TABS */}
              <form onSubmit={handleSubmit} className="space-y-4">

                {activeTab === "transport" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم سند النقل (Trip ID)</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={tripForm.id}
                          onChange={e => setTripForm(p => ({ ...p, id: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">التاريخ</label>
                        <input
                          type="date"
                          required
                          value={tripForm.date}
                          onChange={e => setTripForm(p => ({ ...p, date: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">اسم العميل بالكامل</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: شركة بوعمامة للبناء"
                        value={tripForm.clientName}
                        onChange={e => setTripForm(p => ({ ...p, clientName: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">المصنع المصدر للسلعة</label>
                        <input
                          type="text"
                          required
                          placeholder="مصنع الأسمنت"
                          value={tripForm.originFactory}
                          onChange={e => setTripForm(p => ({ ...p, originFactory: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">وجهة النكوص والمسار</label>
                        <input
                          type="text"
                          required
                          placeholder="موقع 1500 مسكن"
                          value={tripForm.destination}
                          onChange={e => setTripForm(p => ({ ...p, destination: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">نوع المادة المشحونة</label>
                        <input
                          type="text"
                          required
                          placeholder="حصى أو إسمنت"
                          value={tripForm.materialType}
                          onChange={e => setTripForm(p => ({ ...p, materialType: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">مكعبات الحمولة الكلية (طن)</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={tripForm.totalTonnage}
                          onChange={e => setTripForm(p => ({ ...p, totalTonnage: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    {/* STRUCTURE LOGIC - DRIVERS AND PROFITS CORES */}
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <span className="text-[10px] text-cyan-400 font-bold block">تجزئة التكلفة والصافي</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-slate-500 mb-1">كراء الشاحنة</label>
                          <input
                            type="number"
                            required
                            value={tripForm.truckCost}
                            onChange={e => setTripForm(p => ({ ...p, truckCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">أجرة السائق</label>
                          <input
                            type="number"
                            required
                            value={tripForm.driverCut}
                            onChange={e => setTripForm(p => ({ ...p, driverCut: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">ربح الشركة الصافي</label>
                          <input
                            type="number"
                            required
                            value={tripForm.companyProfit}
                            onChange={e => setTripForm(p => ({ ...p, companyProfit: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-white"
                          />
                        </div>
                      </div>
                      <div className="pt-2 text-[10px] text-slate-400 flex justify-between">
                        <span>إجمالي تعريفة النقل التقديرية للعميل:</span>
                        <strong className="text-emerald-400">{computedFormTotalTransportFee.toLocaleString()} دج</strong>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "resale" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم عملية التوريد (ID)</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={resaleForm.id}
                          onChange={e => setResaleForm(p => ({ ...p, id: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">التاريخ</label>
                        <input
                          type="date"
                          required
                          value={resaleForm.date}
                          onChange={e => setResaleForm(p => ({ ...p, date: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">العميل النهائي المستلم للسلعة</label>
                      <input
                        type="text"
                        required
                        placeholder="مشترين الجملة الخارجيين"
                        value={resaleForm.endClient}
                        onChange={e => setResaleForm(p => ({ ...p, endClient: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">سعر الشراء الكلي من الشركة الأصلية (للطن دج)</label>
                        <input
                          type="number"
                          required
                          value={resaleForm.factoryPurchasePrice}
                          onChange={e => setResaleForm(p => ({ ...p, factoryPurchasePrice: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">الحجم بالكل (أطنان)</label>
                        <input
                          type="number"
                          required
                          value={resaleForm.totalTonnage}
                          onChange={e => setResaleForm(p => ({ ...p, totalTonnage: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">السعر البيعي الإجمالي للزبون (Combo Price)</label>
                      <input
                        type="number"
                        required
                        placeholder="ثمن المادة + ثمن خدمات الشحن ككل"
                        value={resaleForm.clientSellingPrice}
                        onChange={e => setResaleForm(p => ({ ...p, clientSellingPrice: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white font-mono font-bold"
                      />
                    </div>

                    {/* TRUCK DRIVER EXPLICIT STRUCTURE */}
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <span className="text-[10px] text-cyan-400 font-bold block">تحليل كلفة النظير اللوجستي الصريح</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-slate-500 mb-1">كراء الشاحنة</label>
                          <input
                            type="number"
                            required
                            value={resaleForm.truckCost}
                            onChange={e => setResaleForm(p => ({ ...p, truckCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">كلفة السائق</label>
                          <input
                            type="number"
                            required
                            value={resaleForm.driverCost}
                            onChange={e => setResaleForm(p => ({ ...p, driverCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">الهامش البارز</label>
                          <input
                            type="number"
                            required
                            value={resaleForm.explicitProfit}
                            onChange={e => setResaleForm(p => ({ ...p, explicitProfit: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-white"
                          />
                        </div>
                      </div>
                      <div className="pt-2 text-[10px] border-t border-slate-800 flex justify-between text-slate-400">
                        <span>قيمة الكسب المستتر (Hidden): <strong className="text-amber-400">{tempHiddenMargin.toLocaleString()} دج</strong></span>
                        <span>إجمالي صافي الربح الحقيقي: <strong className="text-emerald-400">{computedFormTotalTrueProfit.toLocaleString()} دج</strong></span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "expenses" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم الفاتورة / المصرف (ID)</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={expenseForm.id}
                          onChange={e => setExpenseForm(p => ({ ...p, id: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">التاريخ</label>
                        <input
                          type="date"
                          required
                          value={expenseForm.date}
                          onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">تصنيف النفقات الرئيسي</label>
                      <select
                        value={expenseForm.category}
                        onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                      >
                        {EXPENSE_CATEGORIES.map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">رقم لوحة الشاحنة المستهدفة</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: 01345-116-22"
                        value={expenseForm.truckPlate}
                        onChange={e => setExpenseForm(p => ({ ...p, truckPlate: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">المبلغ المالي المصروف (دج)</label>
                        <input
                          type="number"
                          required
                          value={expenseForm.amount}
                          onChange={e => setExpenseForm(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">الحالة النقدية والوفر</label>
                        <select
                          value={expenseForm.status}
                          onChange={e => setExpenseForm(p => ({ ...p, status: e.target.value as 'Paid' | 'Pending' }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        >
                          <option value="Paid">مدفوعة (Paid)</option>
                          <option value="Pending">قيد الدراسة والمطالبة (Pending)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                  >
                    إلغاء الأمر
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/10 transition"
                  >
                    حفظ وإدراج التعديل
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RENDER MODAL: BILINGUAL RECEIPT VIEW & TRIGGER Browser PRINT */}
      <AnimatePresence>
        {isReceiptOpen && selectedReceipt && (
          <div className="no-print fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-slate-900 border border-slate-200 max-w-3xl w-full rounded-2xl p-6 shadow-2xl relative"
            >

              <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4 no-print">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Printer className="h-4 w-4 text-emerald-600 animate-pulse" />
                  <span>معاينة وتأكيد الفاتورة المعتمدة محلياً</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition shadow"
                  >
                    <Printer className="h-4 w-4" />
                    <span>طباعة أو تحميل PDF (Print)</span>
                  </button>
                  <button
                    onClick={() => setIsReceiptOpen(false)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* HIGH FIDELITY LAYOUT: DESIGNED TO LOOK EXTRAORDINARY */}
              <div className="border border-slate-300 p-6 rounded-xl space-y-6 bg-slate-50 text-slate-900">

                <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                  <div>
                    <h2 className="text-xl font-bold font-display text-slate-950">نقل وتوزيع البضائع لعلوي عبد المالك</h2>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase">Bilingual Internal Freight Receipt</p>
                    <p className="text-xs text-slate-600">التاريخ الحالي للنظام: {formatAlgerianDate(new Date())}</p>
                  </div>
                  <div className="text-left">
                    <span className="bg-slate-200 text-slate-900 text-sm font-mono font-black border border-slate-400 px-3 py-1 rounded">
                      {selectedReceipt.data.id}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1.5">تاريخ النقل: {selectedReceipt.data.date}</p>
                  </div>
                </div>

                {selectedReceipt.type === "transport" ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div><span className="text-slate-500">اسم العميل:</span> <strong className="text-slate-900">{selectedReceipt.data.clientName}</strong></div>
                      <div><span className="text-slate-500">المادة المشحونة:</span> <strong className="text-slate-900">{selectedReceipt.data.materialType}</strong></div>
                      <div><span className="text-slate-500">منشأ الشحنة:</span> <strong className="text-slate-900">{selectedReceipt.data.originFactory}</strong></div>
                      <div><span className="text-slate-500">الوجهة المستهدفة:</span> <strong className="text-slate-900">{selectedReceipt.data.destination}</strong></div>
                      <div><span className="text-slate-500">الإجمالي بالوزن:</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} طن</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>منشور تكلفة الشحن (Freight Invoicing)</span>
                        <span className="text-[9px] text-slate-400">عملة الحساب: دج (DZD)</span>
                      </h4>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>صرف كراء المركبة (Truck Lease):</span>
                        <span className="font-mono">{selectedReceipt.data.truckCost.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>أجرة قنوات السائق (Driver Cut):</span>
                        <span className="font-mono">{selectedReceipt.data.driverCut.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>أرباح المؤسسة الصافية (Company net cut):</span>
                        <span className="font-mono text-cyan-800 font-bold">+{selectedReceipt.data.companyProfit.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900 bg-slate-105">
                        <span>المجموع الفاتورة الكلي (Master Total):</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {(selectedReceipt.data.truckCost + selectedReceipt.data.driverCut + selectedReceipt.data.companyProfit).toLocaleString()} دج
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div><span className="text-slate-500">الزبون النهائي:</span> <strong className="text-slate-900">{selectedReceipt.data.endClient}</strong></div>
                      <div><span className="text-slate-500">الحمولة الكلية:</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} طن</strong></div>
                      <div><span className="text-slate-500">سعر شراء المصنع (للطن):</span> <strong className="text-slate-900">{selectedReceipt.data.factoryPurchasePrice.toLocaleString()} دج / طن</strong></div>
                      <div><span className="text-slate-500">كلفة السلع الكلية (Sourcing Cost):</span> <strong className="text-slate-900">{(selectedReceipt.data.factoryPurchasePrice * selectedReceipt.data.totalTonnage).toLocaleString()} دج</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>تحليل الهياكل والتسعير اللوجستي الشامل</span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {selectedReceipt.data.id}</span>
                      </h4>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>كراء الشاحنة البرية (Truck Cost):</span>
                        <span className="font-mono">{selectedReceipt.data.truckCost.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>نظير مجهود السائق (Driver Cost):</span>
                        <span className="font-mono">{selectedReceipt.data.driverCost.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>هامش النقل الصريح البارز (Explicit Profit):</span>
                        <span className="font-mono text-slate-700">+{selectedReceipt.data.explicitProfit.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 font-bold bg-amber-50 px-2 rounded">
                        <span className="text-amber-800">الأرباح المستترة المحققة من التسعير (Hidden Margin):</span>
                        <span className="font-mono text-amber-700">
                          {+(selectedReceipt.data.clientSellingPrice - ((selectedReceipt.data.factoryPurchasePrice * selectedReceipt.data.totalTonnage) + selectedReceipt.data.truckCost + selectedReceipt.data.driverCost + selectedReceipt.data.explicitProfit)).toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900">
                        <span>سعر البيع النهائي المتكامل (Combo selling price):</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {selectedReceipt.data.clientSellingPrice.toLocaleString()} دج
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-300 pt-6 flex justify-between text-xs">
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">توقيع السائق</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">إمضاء وختم العميل</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">اعتماد المحلل المالي</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                </div>

              </div>

              <div className="mt-4 flex justify-end gap-2.5 no-print">
                <button
                  onClick={() => setIsReceiptOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  إغلاق المعاينة
                </button>
                <button
                  onClick={handlePrint}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                >
                  تأكيد وطباعة السند الحالي
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
