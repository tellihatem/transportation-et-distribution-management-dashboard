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

import { ClientTransportTrip, ClientTransportTripInput, MaterialResaleTx, MaterialResaleTxInput, OtherExpense, TabFilters } from "./types";
import { TRANSLATE_EXPENSE_CATEGORY, EXPENSE_CATEGORIES } from "./data";
import { useTrips } from "./hooks/useTrips";
import { useResales } from "./hooks/useResales";
import { useExpenses } from "./hooks/useExpenses";
import { useClientPayments } from "./hooks/useClientPayments";
import { useDriverPayments } from "./hooks/useDriverPayments";
import { ClientAccountsTab } from "./components/ClientAccountsTab";
import { DriverAccountsTab } from "./components/DriverAccountsTab";
import { ExecutiveOverviewTab } from "./components/ExecutiveOverviewTab";
import { downloadBackup, importBackup, fetchNextTripId, fetchNextResaleId, fetchNextExpenseId } from "./api/client";
import logoUrl from "../assets/canvas.png";

// Algerian French-loanword month names, matching the receipt's existing date convention
const ALGERIAN_MONTHS = [
  "جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
  "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

function formatAlgerianDate(d: Date): string {
  return `${d.getDate()} ${ALGERIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Suggested units for the quantity field. The input is free-text, so anything
// else can be typed in — these are just the common ones.
const QUANTITY_UNITS = ["طن", "قنطار", "كيلوغرام", "متر مكعب", "وحدة", "كيس", "لتر", "رحلة"];

// Colored paid/remaining badge used in the trips and resales tables
function PaymentBadge({ paid, total }: { paid: number; total: number }) {
  const remaining = total - paid;
  return remaining <= 0 ? (
    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800/65">
      مدفوع بالكامل
    </span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-900/40 text-amber-300 border border-amber-800">
      متبقي: {remaining.toLocaleString()} دج
    </span>
  );
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
  const { trips: clientTrips, error: tripsError, addTrip, editTrip, removeTrip, reload: reloadTrips } = useTrips(filters);
  const { resales: resaleTxs, error: resalesError, addResale, editResale, removeResale, reload: reloadResales } = useResales(filters);
  const { expenses, error: expensesError, addExpense, editExpense, removeExpense } = useExpenses(filters);
  const { payments: clientPayments, summaries: clientSummaries, recordPayment: recordClientPayment, reload: reloadClientPayments } = useClientPayments(filters);
  const { payments: driverPayments, summaries: driverSummaries, recordPayment: recordDriverPayment, reload: reloadDriverPayments } = useDriverPayments(filters);

  const refreshAllData = () => {
    reloadTrips();
    reloadResales();
    reloadClientPayments();
    reloadDriverPayments();
  };

  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<"overview" | "transport" | "resale" | "clients" | "drivers" | "expenses">("overview");

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
  const [tripForm, setTripForm] = useState<Partial<ClientTransportTripInput>>({
    id: "",
    date: new Date().toISOString().split("T")[0],
    clientName: "",
    originFactory: "",
    destination: "",
    materialType: "",
    totalTonnage: 30,
    quantityUnit: "طن",
    truckCost: 15000,
    driverCut: 5000,
    companyProfit: 5000,
    driverName: "",
  });

  // State for Resale (Tab 2 Form)
  const [resaleForm, setResaleForm] = useState<Partial<MaterialResaleTxInput>>({
    id: "",
    date: new Date().toISOString().split("T")[0],
    endClient: "",
    destination: "",
    materialType: "",
    originFactory: "",
    factoryPurchasePrice: 1500,
    totalTonnage: 40,
    quantityUnit: "طن",
    clientSellingPrice: 150000,
    truckCost: 18000,
    driverCost: 5000,
    explicitProfit: 8000,
    driverName: "",
    tripCount: 0,
    tripUnitCost: 0,
  });

  // Selling price per unit for the resale form. Form-only helper: the record
  // stores the TOTAL (clientSellingPrice), but the operator normally thinks in
  // price-per-unit, and the total must follow when the quantity changes.
  const [resaleUnitPrice, setResaleUnitPrice] = useState<number>(0);

  // Keep the two in sync from either direction.
  const setResaleSellingByUnit = (unitPrice: number) => {
    setResaleUnitPrice(unitPrice);
    setResaleForm(p => ({
      ...p,
      clientSellingPrice: Math.round(unitPrice * (Number(p.totalTonnage) || 0)),
    }));
  };

  const setResaleQuantity = (qty: number) => {
    setResaleForm(p => ({
      ...p,
      totalTonnage: qty,
      // Only re-derive the total when a unit price is actually in play,
      // so a manually typed total is never silently overwritten.
      clientSellingPrice: resaleUnitPrice > 0
        ? Math.round(resaleUnitPrice * qty)
        : p.clientSellingPrice,
    }));
  };

  const setResaleSellingTotal = (total: number) => {
    setResaleForm(p => {
      const qty = Number(p.totalTonnage) || 0;
      setResaleUnitPrice(qty > 0 ? total / qty : 0);
      return { ...p, clientSellingPrice: total };
    });
  };

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
        (t.driverName || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
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
        (tx.destination || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        (tx.driverName || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        (tx.materialType || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        (tx.originFactory || "").toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
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
    let clientOutstanding = 0; // Still owed by clients
    let driverOutstanding = 0; // Still owed to drivers
    let clientCollected = 0;   // Cash actually received (from the client ledger)
    let driverSettled = 0;     // Cash actually paid out (from the driver ledger)

    filteredClientTrips.forEach(trip => {
      const tripFee = trip.truckCost + trip.driverCut + trip.companyProfit;
      grossRevenue += tripFee;
      driverPayout += trip.driverCut;
      netMargin += trip.companyProfit;
      totalTons += trip.totalTonnage;
      clientOutstanding += Math.max(0, tripFee - (trip.clientPaid || 0));
      driverOutstanding += Math.max(0, trip.driverCut - (trip.driverPaid || 0));
      clientCollected += (trip.clientPaid || 0);
      driverSettled += (trip.driverPaid || 0);
    });

    return { grossRevenue, driverPayout, netMargin, totalTons, clientOutstanding, driverOutstanding, clientCollected, driverSettled };
  }, [filteredClientTrips]);

  // Tab 2 Profits
  const tab2Stats = useMemo(() => {
    let tradingTurnover = 0; // client selling price
    let capitalOutlay = 0;    // purchase price * tonnage
    let totalTrueProfit = 0;
    let totalTons = 0;
    let clientOutstanding = 0; // Still owed by clients
    let driverOutstanding = 0; // Still owed to drivers
    let clientCollected = 0;   // Cash actually received (from the client ledger)
    let driverSettled = 0;     // Cash actually paid out (from the driver ledger)

    filteredResaleTxs.forEach(tx => {
      const sourcingCost = tx.factoryPurchasePrice * tx.totalTonnage;
      const visibleTransportFee = tx.truckCost + tx.driverCost + tx.explicitProfit;
      const hiddenMargin = tx.clientSellingPrice - (sourcingCost + visibleTransportFee);
      const trueProfit = tx.explicitProfit + hiddenMargin;

      tradingTurnover += tx.clientSellingPrice;
      capitalOutlay += sourcingCost;
      totalTrueProfit += trueProfit;
      totalTons += tx.totalTonnage;
      clientOutstanding += Math.max(0, tx.clientSellingPrice - (tx.clientPaid || 0));
      driverOutstanding += Math.max(0, tx.driverCost - (tx.driverPaid || 0));
      clientCollected += (tx.clientPaid || 0);
      driverSettled += (tx.driverPaid || 0);
    });

    return { tradingTurnover, capitalOutlay, totalTrueProfit, totalTons, clientOutstanding, driverOutstanding, clientCollected, driverSettled };
  }, [filteredResaleTxs]);

  // Tab 3 Expenses
  // Only approved (Paid) expenses count as real overhead. Items still marked
  // "قيد الدراسة والمطالبة" (Pending) are not approved yet, so they must not
  // reduce profit or appear in the spending breakdown — they are reported
  // separately as pendingTotal.
  const tab3Stats = useMemo(() => {
    let totalOverhead = 0;
    let pendingTotal = 0;
    let categoryBreakdown: Record<string, number> = {};

    filteredExpenses.forEach(exp => {
      if (exp.status === "Pending") {
        pendingTotal += exp.amount;
        return;
      }
      totalOverhead += exp.amount;
      categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + exp.amount;
    });

    return { totalOverhead, pendingTotal, categoryBreakdown };
  }, [filteredExpenses]);

  // Company net PROFIT for the selected period (accrual): earned margin on
  // transport + resale, minus approved operating expenses. This is what the
  // business made on paper — it is NOT cash in hand, because a trip counts as
  // soon as it is invoiced whether or not the client has paid.
  const masterNetProfit = (tab1Stats.netMargin + tab2Stats.totalTrueProfit) - tab3Stats.totalOverhead;

  // Actual cash position for the same filtered rows, taken from the payment
  // ledgers (client_paid / driver_paid are kept in sync by the allocations).
  // Derived from the same filtered records as the profit above so the two
  // figures always describe the same period — the /summary endpoints are
  // all-time and would not line up here.
  const periodCash = {
    collected: tab1Stats.clientCollected + tab2Stats.clientCollected,
    receivable: tab1Stats.clientOutstanding + tab2Stats.clientOutstanding,
    driverSettled: tab1Stats.driverSettled + tab2Stats.driverSettled,
    driverPayable: tab1Stats.driverOutstanding + tab2Stats.driverOutstanding,
  };

  // --- Add / Edit Records Logic ---
  // IDs are sequential (TR-1, TR-2, ...), computed server-side from the full
  // table so month/search filters on the loaded list can't cause collisions.
  const localNextId = (prefix: string, ids: string[]) => {
    const max = ids.reduce((m, id) => {
      const match = id.match(/(\d+)\s*$/);
      return match ? Math.max(m, parseInt(match[1], 10)) : m;
    }, 0);
    return `${prefix}${max + 1}`;
  };

  const [modalRecordType, setModalRecordType] = useState<"transport" | "resale" | "expenses">("transport");

  const handleOpenAdd = async (type?: "transport" | "resale" | "expenses") => {
    setModalType("add");
    setEditRecordId(null);
    const targetType = type || (activeTab === "resale" ? "resale" : activeTab === "expenses" ? "expenses" : "transport");
    setModalRecordType(targetType);

    if (targetType === "transport") {
      const id = await fetchNextTripId().catch(() => localNextId("TR-", clientTrips.map(t => t.id)));
      setTripForm({
        id,
        date: new Date().toISOString().split("T")[0],
        clientName: "",
        originFactory: "",
        destination: "",
        materialType: "",
        totalTonnage: 32,
        quantityUnit: "طن",
        truckCost: 15000,
        driverCut: 5000,
        companyProfit: 6000,
        driverName: "",
      });
    } else if (targetType === "resale") {
      const id = await fetchNextResaleId().catch(() => localNextId("RS-", resaleTxs.map(t => t.id)));
      setResaleForm({
        id,
        date: new Date().toISOString().split("T")[0],
        endClient: "",
        destination: "",
        materialType: "",
        originFactory: "",
        factoryPurchasePrice: 1500,
        totalTonnage: 40,
        quantityUnit: "طن",
        clientSellingPrice: 180000,
        truckCost: 18000,
        driverCost: 5000,
        explicitProfit: 8000,
        driverName: "",
        tripCount: 0,
        tripUnitCost: 0,
      });
      setResaleUnitPrice(180000 / 40);
    } else {
      const id = await fetchNextExpenseId().catch(() => localNextId("EXP-", expenses.map(e => e.id)));
      setExpenseForm({
        id,
        date: new Date().toISOString().split("T")[0],
        category: "Fuel",
        truckPlate: "",
        amount: 15000,
        status: "Paid"
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: any, type?: "transport" | "resale" | "expenses") => {
    setModalType("edit");
    setEditRecordId(record.id);
    const targetType = type || (record.endClient ? "resale" : record.category ? "expenses" : "transport");
    setModalRecordType(targetType);

    if (targetType === "transport") {
      setTripForm({ ...record });
    } else if (targetType === "resale") {
      setResaleForm({ ...record });
      const qty = Number(record.totalTonnage) || 0;
      setResaleUnitPrice(qty > 0 ? (Number(record.clientSellingPrice) || 0) / qty : 0);
    } else {
      setExpenseForm({ ...record });
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, type?: "transport" | "resale" | "expenses") => {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السجل بشكل نهائي؟")) return;
    const targetType = type || (activeTab === "resale" ? "resale" : activeTab === "expenses" ? "expenses" : "transport");
    try {
      if (targetType === "transport") {
        await removeTrip(id);
      } else if (targetType === "resale") {
        await removeResale(id);
      } else {
        await removeExpense(id);
      }
      refreshAllData();
    } catch (err: any) {
      alert(`تعذر حذف السجل: ${err.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalRecordType === "transport") {
        const data: ClientTransportTripInput = {
          id: tripForm.id || localNextId("TR-", clientTrips.map(t => t.id)),
          date: tripForm.date || "",
          clientName: tripForm.clientName || "",
          originFactory: tripForm.originFactory || "",
          destination: tripForm.destination || "",
          materialType: tripForm.materialType || "",
          totalTonnage: Number(tripForm.totalTonnage) || 0,
          quantityUnit: tripForm.quantityUnit || "طن",
          truckCost: Number(tripForm.truckCost) || 0,
          driverCut: Number(tripForm.driverCut) || 0,
          companyProfit: Number(tripForm.companyProfit) || 0,
          driverName: tripForm.driverName || ""
        };

        if (modalType === "add") {
          await addTrip(data);
        } else {
          await editTrip(editRecordId!, data);
        }
      } else if (modalRecordType === "resale") {
        const data: MaterialResaleTxInput = {
          id: resaleForm.id || localNextId("RS-", resaleTxs.map(t => t.id)),
          date: resaleForm.date || "",
          endClient: resaleForm.endClient || "",
          destination: resaleForm.destination || "",
          materialType: resaleForm.materialType || "",
          originFactory: resaleForm.originFactory || "",
          factoryPurchasePrice: Number(resaleForm.factoryPurchasePrice) || 0,
          totalTonnage: Number(resaleForm.totalTonnage) || 0,
          quantityUnit: resaleForm.quantityUnit || "طن",
          clientSellingPrice: Number(resaleForm.clientSellingPrice) || 0,
          truckCost: Number(resaleForm.truckCost) || 0,
          driverCost: Number(resaleForm.driverCost) || 0,
          explicitProfit: Number(resaleForm.explicitProfit) || 0,
          driverName: resaleForm.driverName || "",
          tripCount: Number(resaleForm.tripCount) || 0,
          tripUnitCost: Number(resaleForm.tripUnitCost) || 0,
        };

        if (modalType === "add") {
          await addResale(data);
        } else {
          await editResale(editRecordId!, data);
        }
      } else {
        const data: OtherExpense = {
          id: expenseForm.id || localNextId("EXP-", expenses.map(e => e.id)),
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
      refreshAllData();
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
      "تكلفة الشاحنة": trip.truckCost,
      "مستحقات السائق": trip.driverCut,
      "هامش الشركة": trip.companyProfit,
    })).reverse();
  }, [filteredClientTrips]);

  // Chart data for Tab 2 sourcing vs resale combo comparison
  const tab2ChartData = useMemo(() => {
    return filteredResaleTxs.slice(0, 10).map(tx => {
      const sourcingCost = tx.factoryPurchasePrice * tx.totalTonnage;
      return {
        name: tx.id,
        "تكلفة شراء المادة": sourcingCost,
        "سعر البيع النهائي": tx.clientSellingPrice,
        "إجمالي الربح الفعلي": tx.explicitProfit + (tx.clientSellingPrice - (sourcingCost + tx.truckCost + tx.driverCost + tx.explicitProfit))
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
          /* Statement of Account print container — same pattern */
          .print-statement-container {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            direction: rtl !important;
            padding: 20px !important;
            color: black !important;
            background: white !important;
          }
          .print-statement-container * {
            visibility: visible !important;
            color: black !important;
          }
          .print-statement-container table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .print-statement-container th,
          .print-statement-container td {
            border: 1px solid #888 !important;
            padding: 4px 8px !important;
            text-align: right !important;
            font-size: 10px !important;
          }
          .print-statement-container th {
            background: #eee !important;
            font-weight: bold !important;
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
                <img src={logoUrl} alt="شعار الشركة" className="h-16 w-16 object-contain shrink-0" />
                <div>
                  <h1 className="text-2xl font-bold font-display text-slate-950">نقل وتوزيع البضائع لعلاوي عبد المالك</h1>
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
                  <span className="text-slate-600">الكمية الإجمالية:</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || "طن"}</strong>
                </div>
                <div>
                  <span className="text-slate-600">المادة المشحونة:</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.materialType || "—"}</strong>
                </div>
                <div>
                  <span className="text-slate-600">منشأ الشحنة:</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.originFactory || "—"}</strong>
                </div>
                <div>
                  <span className="text-slate-600">الوجهة المستهدفة:</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.destination || "—"}</strong>
                </div>
                {selectedReceipt.data.driverName && (
                  <div>
                    <span className="text-slate-600">السائق:</span>{" "}
                    <strong className="text-slate-900">{selectedReceipt.data.driverName}</strong>
                  </div>
                )}
              </div>
            </div>

            {(() => {
              const factureTotal = selectedReceipt.type === "transport"
                ? selectedReceipt.data.truckCost + selectedReceipt.data.driverCut + selectedReceipt.data.companyProfit
                : selectedReceipt.data.clientSellingPrice;
              const facturePaid = selectedReceipt.data.clientPaid || 0;
              const factureRemaining = factureTotal - facturePaid;

              if (selectedReceipt.type === "resale") {
                const unitPrice = selectedReceipt.data.factoryPurchasePrice || 0;
                const qty = selectedReceipt.data.totalTonnage || 0;
                const unit = selectedReceipt.data.quantityUnit || "طن";
                const productSubtotal = unitPrice * qty;
                const transportPrice = factureTotal - productSubtotal;
                return (
                  <div className="bg-slate-100 border-2 border-slate-800 rounded-lg p-6 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-700">ثمن البضاعة ({qty} {unit} × {unitPrice.toLocaleString()} دج)</span>
                      <span className="font-mono font-bold text-slate-900">{productSubtotal.toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                      <span className="text-slate-700">
                        {(selectedReceipt.data.tripCount > 0 && selectedReceipt.data.tripUnitCost > 0)
                          ? `سعر النقل والتوصيل (${selectedReceipt.data.tripCount} رحلات × ${selectedReceipt.data.tripUnitCost.toLocaleString()} دج)`
                          : "سعر النقل والتوصيل"}
                      </span>
                      <span className="font-mono font-bold text-slate-900">{transportPrice.toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between items-center border-t-2 border-slate-800 pt-2">
                      <span className="text-base font-bold text-slate-900">المبلغ الإجمالي الواجب دفعه</span>
                      <span className="text-2xl font-mono font-bold text-slate-950">{factureTotal.toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                      <span className="text-slate-700">المدفوع</span>
                      <span className="font-mono font-bold text-slate-900">{facturePaid.toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between items-center text-base">
                      <span className="font-bold text-slate-900">المتبقي</span>
                      <span className="font-mono font-bold text-slate-950">{factureRemaining.toLocaleString()} دج</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-slate-100 border-2 border-slate-800 rounded-lg p-6 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-700">سعر النقل</span>
                    <span className="font-mono font-bold text-slate-900">{factureTotal.toLocaleString()} دج</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-300 pt-2">
                    <span className="text-base font-bold text-slate-900">المبلغ الإجمالي الواجب دفعه</span>
                    <span className="text-2xl font-mono font-bold text-slate-950">{factureTotal.toLocaleString()} دج</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                    <span className="text-slate-700">المدفوع</span>
                    <span className="font-mono font-bold text-slate-900">{facturePaid.toLocaleString()} دج</span>
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="font-bold text-slate-900">المتبقي</span>
                    <span className="font-mono font-bold text-slate-950">{factureRemaining.toLocaleString()} دج</span>
                  </div>
                </div>
              );
            })()}

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
                <p className="font-bold mb-8">صادق عليها المسؤول</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
                <p className="font-mono text-[10px] text-slate-500 mt-1">لعلاوي عبد المالك</p>
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
                  <img src={logoUrl} alt="شعار الشركة" width={60} height={60} className="object-contain" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight font-display bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2">
                    <span>نقل وتوزيع البضائع لعلاوي عبد المالك</span>
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
                  <span className="text-white font-mono font-bold">السيد لعلاوي عبد المالك</span>
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
{/* 
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>متصل بقاعدة البيانات المباشرة</span>
                </div> */}
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
                  <span className="font-bold text-slate-300">الملخص المالي الشامل للفترة المحددة</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold text-white font-display">
                  معادلة صافي ربح الشركة
                </h2>

                {/* Mathematical visual schema */}
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">أرباح رحلات نقل العملاء</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab1Stats.netMargin.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">+</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">أرباح بيع وتوصيل المواد</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab2Stats.totalTrueProfit.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">-</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">مصاريف الأسطول المدفوعة</span>
                    <span className="text-rose-400 font-bold font-mono">-{tab3Stats.totalOverhead.toLocaleString()} دج</span>
                  </div>
                  <span className="text-slate-500 font-bold text-lg">=</span>
                  <div className="bg-slate-800/40 px-3 py-1 rounded border border-slate-700 flex flex-col">
                    <span className="text-[10px] text-cyan-400 font-bold">صافي ربح الشركة</span>
                    <span className={`font-mono font-bold text-base ${masterNetProfit >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                      {masterNetProfit.toLocaleString()} دج
                    </span>
                  </div>
                </div>

                {/* Actual cash position — profit above is accrued, this is what
                    has really been collected/paid according to the ledgers. */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">المحصل من العملاء</span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">{periodCash.collected.toLocaleString()} دج</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">متبقي على العملاء</span>
                    <span className="text-amber-400 font-bold font-mono text-sm">{periodCash.receivable.toLocaleString()} دج</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">المدفوع للسائقين</span>
                    <span className="text-blue-400 font-bold font-mono text-sm">{periodCash.driverSettled.toLocaleString()} دج</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">متبقي للسائقين</span>
                    <span className="text-rose-400 font-bold font-mono text-sm">{periodCash.driverPayable.toLocaleString()} دج</span>
                  </div>
                </div>
              </div>

              {/* High impact visualization counter */}
              <div className="lg:col-span-4 bg-[#1e293b]/50 border border-slate-800 rounded-2xl p-5 text-center flex flex-col justify-center items-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">صافي ربح الشركة خلال الفترة</p>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-4xl font-black font-mono tracking-tight ${masterNetProfit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(34,197,94,0.2)]' : 'text-rose-500'}`}>
                    {masterNetProfit.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-400">دج</span>
                </div>

                <p className="mt-1 text-[10px] text-slate-500">ربح محتسب على الفواتير، وليس نقداً في الخزينة</p>

                <div className="mt-3 flex items-center justify-center gap-1.5 py-1 px-3.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  {masterNetProfit >= 0 ? (
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

                {periodCash.receivable > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 py-1 px-3 rounded-full bg-amber-950/40 border border-amber-900/60 text-[10px] text-amber-300">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{periodCash.receivable.toLocaleString()} دج لم تُحصّل بعد من العملاء</span>
                  </div>
                )}
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
            <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto gap-1">

              <button
                onClick={() => { setActiveTab("overview"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "overview"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>لوحة القيادة الموحدة</span>
              </button>

              <button
                onClick={() => { setActiveTab("transport"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "transport"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Truck className="h-3.5 w-3.5" />
                <span>رحلات نقل العملاء</span>
              </button>

              <button
                onClick={() => { setActiveTab("resale"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "resale"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>بيع وتوصيل المواد</span>
              </button>

              <button
                onClick={() => { setActiveTab("clients"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "clients"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                <span>حسابات العملاء</span>
              </button>

              <button
                onClick={() => { setActiveTab("drivers"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "drivers"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Truck className="h-3.5 w-3.5 text-cyan-400" />
                <span>تصفية السائقين</span>
              </button>

              <button
                onClick={() => { setActiveTab("expenses"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "expenses"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                <span>مصاريف الأسطول الأُخرى</span>
              </button>

            </div>

          </div>
        </section>

        {/* CONTAINER CONTENT ACCORDING TO TABS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <AnimatePresence mode="wait">

            {/* TAB OVERVIEW: EXECUTIVE DASHBOARD */}
            {activeTab === "overview" && (
              <motion.div
                key="tab-overview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <ExecutiveOverviewTab
                  trips={clientTrips}
                  resales={resaleTxs}
                  expenses={expenses}
                  clientSummaries={clientSummaries}
                  driverSummaries={driverSummaries}
                  onNavigateTab={tab => setActiveTab(tab)}
                />
              </motion.div>
            )}

            {/* TAB CLIENTS: CLIENT ACCOUNTS & RECEIVABLES */}
            {activeTab === "clients" && (
              <motion.div
                key="tab-clients"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <ClientAccountsTab
                  summaries={clientSummaries}
                  loading={false}
                  filters={filters}
                  onRecordPayment={recordClientPayment}
                  onRefreshTrips={refreshAllData}
                />
              </motion.div>
            )}

            {/* TAB DRIVERS: DRIVER ACCOUNTS & SETTLEMENTS */}
            {activeTab === "drivers" && (
              <motion.div
                key="tab-drivers"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <DriverAccountsTab
                  summaries={driverSummaries}
                  loading={false}
                  filters={filters}
                  onRecordPayment={recordDriverPayment}
                  onRefreshTrips={refreshAllData}
                />
              </motion.div>
            )}

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
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">عدد الرحلات الجارية</span>
                    <span className="text-3xl font-black font-mono text-blue-400 block mt-1">{filteredClientTrips.length}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">رحلة مرصودة للعملاء الفعليين</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">إجمالي الإيرادات</span>
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab1Stats.grossRevenue.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">تكلفة الشحن الكلية المحتسبة للعميل</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">إجمالي أجور السائقين</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">{tab1Stats.driverPayout.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">الأجور المستحقة عن الرحلات (مدفوعة وغير مدفوعة)</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">الربح الصافي للشركة</span>
                      <PiggyBank className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-cyan-300 block mt-1">{tab1Stats.netMargin.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">الهامش الباقي لخزانة المؤسسة</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">متبقي على العملاء</span>
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-amber-400 block mt-1">{tab1Stats.clientOutstanding.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">مبالغ لم يسددها العملاء بعد</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">متبقي للسائقين</span>
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab1Stats.driverOutstanding.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">مستحقات لم تُدفع للسائقين بعد</span>
                  </div>
                </div>

                {/* Main workspace: records table first (full width), chart below */}
                <div className="flex flex-col gap-6">

                  {/* Cost Split stacked bar chart */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
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
                            <Bar dataKey="تكلفة الشاحنة" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="مستحقات السائق" stackId="a" fill="#10b981" />
                            <Bar dataKey="هامش الشركة" stackId="a" fill="#06b6d4" />
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
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">تفاصيل الشحنات والمطالبات</h4>
                        <button
                          onClick={() => handleOpenAdd("transport")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>تسجيل رحلة عميل</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">رقم السند</th>
                              <th className="p-3">التاريخ</th>
                              <th className="p-3">العميل والمادة</th>
                              <th className="p-3">تفاصيل النقل</th>
                              <th className="p-3">الكمية</th>
                              <th className="p-3">التعريفة الإجمالية</th>
                              <th className="p-3">مدفوعات العميل</th>
                              <th className="p-3">السائق ومدفوعاته</th>
                              <th className="p-3 text-left">أدوات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredClientTrips.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-6 text-center text-slate-500">لا توجد سجلات رحلات مطابقة للتصفية الحالية.</td>
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
                                    <td className="p-3 font-mono text-slate-100">{trip.totalTonnage} {trip.quantityUnit || "طن"}</td>
                                    <td className="p-3 font-mono font-bold text-emerald-400">{totalCost.toLocaleString()} دج</td>
                                    <td className="p-3">
                                      <div className="font-mono text-slate-300">{(trip.clientPaid || 0).toLocaleString()} دج</div>
                                      <div className="mt-1"><PaymentBadge paid={trip.clientPaid || 0} total={totalCost} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{trip.driverName || "—"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {(trip.driverPaid || 0).toLocaleString()} / {trip.driverCut.toLocaleString()} دج
                                      </div>
                                      <div className="mt-1"><PaymentBadge paid={trip.driverPaid || 0} total={trip.driverCut} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5 justify-end">

                                        <button
                                          onClick={() => handleOpenReceipt("transport", trip)}
                                          className="p-1 px-2.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 transition flex items-center gap-1"
                                          title="طباعة الوصل"
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
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">إجمالي مبيعات الزبائن</span>
                    <span className="text-3xl font-black font-mono text-cyan-400 block mt-1">{tab2Stats.tradingTurnover.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">حجم تعاملات التوريد الكلي للمواد</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">رأس المال والمشتريات</span>
                      <TrendingDown className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab2Stats.capitalOutlay.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">القيمة المستحقة للمصنع لشراء المواد</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">أجور النقل الظاهرة</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">
                      {filteredResaleTxs.reduce((sum, tx) => sum + tx.truckCost + tx.driverCost + tx.explicitProfit, 0).toLocaleString()} دج
                    </span>
                    <span className="text-[10px] text-slate-500">رسوم النقل المقيدة على المعاملة</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">إجمالي الربح الحقيقي</span>
                      <ProfitIcon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab2Stats.totalTrueProfit.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-0.5 text-xs text-slate-300">
                      <Info className="h-3 w-3 inline text-emerald-400" />
                      <span>يشمل الكسب المستتر والهامش الظاهر</span>
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">متبقي على العملاء</span>
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-amber-400 block mt-1">{tab2Stats.clientOutstanding.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">مبالغ لم يسددها الزبائن بعد</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">متبقي للسائقين</span>
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab2Stats.driverOutstanding.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-500">مستحقات لم تُدفع للسائقين بعد</span>
                  </div>
                </div>

                {/* Main workspace: records table first (full width), chart below */}
                <div className="flex flex-col gap-6">

                  {/* Sourcing Cost vs Final selling Combo */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">مقارنة كلفة شراء السلع بعوائد البيع</h4>
                      <p className="text-[10px] text-slate-400 mb-4">يعكس بوضوح الكفاءة النقدية للشركة وإجمالي الكسب المستتر</p>
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
                            <Bar dataKey="تكلفة شراء المادة" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="سعر البيع النهائي" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                            <Line type="monotone" dataKey="إجمالي الربح الفعلي" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
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
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">إعادة بيع وتوريد السلع</h4>
                        <button
                          onClick={() => handleOpenAdd("resale")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>تسجيل صفقة تجارية</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">رقم العملية</th>
                              <th className="p-3">التاريخ</th>
                              <th className="p-3">الزبون النهائي</th>
                              <th className="p-3">تفاصيل الأسعار</th>
                              <th className="p-3">الهامش المستتر</th>
                              <th className="p-3">إجمالي الكسب الحقيقي</th>
                              <th className="p-3">مدفوعات العميل</th>
                              <th className="p-3">السائق ومدفوعاته</th>
                              <th className="p-3 text-left">أدوات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredResaleTxs.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-6 text-center text-slate-500">لا توجد صفقات تجارية مسجلة.</td>
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
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.totalTonnage} {tx.quantityUnit || "طن"} × {tx.factoryPurchasePrice} دج</div>
                                      {tx.destination && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">إلى: {tx.destination}</div>
                                      )}
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
                                      <div className="font-mono text-slate-300">{(tx.clientPaid || 0).toLocaleString()} دج</div>
                                      <div className="mt-1"><PaymentBadge paid={tx.clientPaid || 0} total={tx.clientSellingPrice} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{tx.driverName || "—"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {(tx.driverPaid || 0).toLocaleString()} / {tx.driverCost.toLocaleString()} دج
                                      </div>
                                      <div className="mt-1"><PaymentBadge paid={tx.driverPaid || 0} total={tx.driverCost} /></div>
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
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">سجلات الأعباء الكلية</span>
                    <span className="text-3xl font-black font-mono text-rose-400 block mt-1">{filteredExpenses.length}</span>
                    <span className="text-[10px] text-slate-500">عمليّة صرف تشغيلية مسجلة</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">إجمالي المصاريف والمحروقات</span>
                    <span className="text-3xl font-black font-mono text-rose-500 block mt-1">{tab3Stats.totalOverhead.toLocaleString()} دج</span>
                    <span className="text-[10px] text-slate-400">المصاريف المدفوعة فقط (لا تشمل المعلّقة)</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">الأعباء المعلّقة</span>
                    <span className="text-2xl font-black font-mono text-amber-500 block">
                      {tab3Stats.pendingTotal.toLocaleString()} دج
                    </span>
                    <span className="text-[10px] text-slate-500">قيد الدراسة ولم تُحتسب ضمن المصاريف</span>
                  </div>
                </div>

                <div className="flex flex-col gap-6">

                  {/* Expense Breakdown Categories */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
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
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-white">جدول المصاريف والصيانات والأجور</h4>
                        <button
                          onClick={() => handleOpenAdd("expenses")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>إدراج سند أعباء</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
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
                    ({modalRecordType === "transport" ? "شحن عميل" : modalRecordType === "resale" ? "تجارة وتوريد" : "أعباء ومصاريف"})
                  </span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
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
              <form onSubmit={handleSubmit} className="space-y-4">

                {modalRecordType === "transport" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم سند النقل</label>
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

                    <div className="grid grid-cols-2 gap-3">
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
                      <div>
                        <label className="block text-slate-400 mb-1">اسم السائق</label>
                        <input
                          type="text"
                          placeholder="السائق المكلف بالرحلة"
                          value={tripForm.driverName}
                          onChange={e => setTripForm(p => ({ ...p, driverName: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
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
                        <label className="block text-slate-400 mb-1">الكمية الإجمالية</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.1"
                            required
                            value={tripForm.totalTonnage}
                            onChange={e => setTripForm(p => ({ ...p, totalTonnage: parseFloat(e.target.value) || 0 }))}
                            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                          />
                          <input
                            type="text"
                            list="quantity-units"
                            required
                            placeholder="الوحدة"
                            value={tripForm.quantityUnit}
                            onChange={e => setTripForm(p => ({ ...p, quantityUnit: e.target.value }))}
                            className="w-24 shrink-0 bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                          />
                        </div>
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

                    {/* Note: Payment tracking (المدفوعات) is now managed via the Client Accounts and Driver Accounts tabs */}
                  </div>
                )}

                {modalRecordType === "resale" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم عملية التوريد</label>
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
                        <label className="block text-slate-400 mb-1">الوجهة (المكان الذي ستُنقل إليه السلعة)</label>
                        <input
                          type="text"
                          required
                          placeholder="موقع التسليم النهائي"
                          value={resaleForm.destination}
                          onChange={e => setResaleForm(p => ({ ...p, destination: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">اسم السائق</label>
                        <input
                          type="text"
                          placeholder="السائق المكلف بالتوصيل"
                          value={resaleForm.driverName}
                          onChange={e => setResaleForm(p => ({ ...p, driverName: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">نوع المادة المباعة</label>
                        <input
                          type="text"
                          required
                          placeholder="حصى أو إسمنت"
                          value={resaleForm.materialType}
                          onChange={e => setResaleForm(p => ({ ...p, materialType: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">المصنع المصدر للسلعة</label>
                        <input
                          type="text"
                          required
                          placeholder="مصنع الأسمنت"
                          value={resaleForm.originFactory}
                          onChange={e => setResaleForm(p => ({ ...p, originFactory: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">سعر الشراء من الشركة الأصلية (للوحدة دج)</label>
                        <input
                          type="number"
                          required
                          value={resaleForm.factoryPurchasePrice}
                          onChange={e => setResaleForm(p => ({ ...p, factoryPurchasePrice: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">الكمية الإجمالية</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            required
                            value={resaleForm.totalTonnage}
                            onChange={e => setResaleQuantity(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                          />
                          <input
                            type="text"
                            list="quantity-units"
                            required
                            placeholder="الوحدة"
                            value={resaleForm.quantityUnit}
                            onChange={e => setResaleForm(p => ({ ...p, quantityUnit: e.target.value }))}
                            className="w-24 shrink-0 bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 -mt-1 flex justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                      <span>تكلفة شراء البضاعة (الكمية × سعر الوحدة):</span>
                      <strong className="text-rose-300 font-mono">{tempSourcingCost.toLocaleString()} دج</strong>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">سعر البيع للزبون (للوحدة دج)</label>
                        <input
                          type="number"
                          value={resaleUnitPrice ? Math.round(resaleUnitPrice) : ""}
                          placeholder="سعر بيع الوحدة الواحدة"
                          onChange={e => setResaleSellingByUnit(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">السعر البيعي الإجمالي للزبون</label>
                        <input
                          type="number"
                          required
                          placeholder="ثمن المادة + ثمن خدمات الشحن ككل"
                          value={resaleForm.clientSellingPrice}
                          onChange={e => setResaleSellingTotal(parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white font-mono font-bold"
                        />
                      </div>
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
                        <span>قيمة الكسب المستتر: <strong className="text-amber-400">{tempHiddenMargin.toLocaleString()} دج</strong></span>
                        <span>إجمالي صافي الربح الحقيقي: <strong className="text-emerald-400">{computedFormTotalTrueProfit.toLocaleString()} دج</strong></span>
                      </div>
                    </div>

                    {/* Optional multi-trip breakdown */}
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <span className="text-[10px] text-violet-400 font-bold block">تعدد الرحلات (اختياري)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 mb-1">عدد الرحلات</label>
                          <input
                            type="number"
                            min="0"
                            value={resaleForm.tripCount || ""}
                            placeholder="0"
                            onChange={e => setResaleForm(p => ({ ...p, tripCount: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">سعر الرحلة الواحدة (دج)</label>
                          <input
                            type="number"
                            min="0"
                            value={resaleForm.tripUnitCost || ""}
                            placeholder="0"
                            onChange={e => setResaleForm(p => ({ ...p, tripUnitCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-white"
                          />
                        </div>
                      </div>
                      {(Number(resaleForm.tripCount) > 0 && Number(resaleForm.tripUnitCost) > 0) && (
                        <div className="pt-2 text-[10px] border-t border-slate-800 flex justify-between text-slate-400">
                          <span>إجمالي تكلفة النقل:</span>
                          <strong className="text-violet-400 font-mono">{(Number(resaleForm.tripCount) * Number(resaleForm.tripUnitCost)).toLocaleString()} دج</strong>
                        </div>
                      )}
                    </div>

                    {/* Note: Payment tracking (المدفوعات) is now managed via the Client Accounts and Driver Accounts tabs */}
                  </div>
                )}

                {modalRecordType === "expenses" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">رقم الفاتورة / المصرف</label>
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
                          <option value="Paid">مدفوعة</option>
                          <option value="Pending">قيد الدراسة والمطالبة</option>
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
                    <span>طباعة الوصل</span>
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
                    <h2 className="text-xl font-bold font-display text-slate-950">نقل وتوزيع البضائع لعلاوي عبد المالك</h2>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase">وصل شحن داخلي رسمي</p>
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
                      <div><span className="text-slate-500">الكمية الإجمالية:</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || "طن"}</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>منشور تكلفة الشحن</span>
                        <span className="text-[9px] text-slate-400">عملة الحساب: الدينار الجزائري</span>
                      </h4>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>صرف كراء المركبة:</span>
                        <span className="font-mono">{selectedReceipt.data.truckCost.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>أجرة السائق:</span>
                        <span className="font-mono">{selectedReceipt.data.driverCut.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>أرباح المؤسسة الصافية:</span>
                        <span className="font-mono text-cyan-800 font-bold">+{selectedReceipt.data.companyProfit.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900 bg-slate-105">
                        <span>مجموع الفاتورة الكلي:</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {(selectedReceipt.data.truckCost + selectedReceipt.data.driverCut + selectedReceipt.data.companyProfit).toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>المدفوع من العميل:</span>
                        <span className="font-mono">{(selectedReceipt.data.clientPaid || 0).toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 font-bold">
                        <span className="text-slate-800">المتبقي على العميل:</span>
                        <span className="font-mono text-amber-700">
                          {(selectedReceipt.data.truckCost + selectedReceipt.data.driverCut + selectedReceipt.data.companyProfit - (selectedReceipt.data.clientPaid || 0)).toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>السائق ({selectedReceipt.data.driverName || "غير محدد"}) — المدفوع له:</span>
                        <span className="font-mono">{(selectedReceipt.data.driverPaid || 0).toLocaleString()} / {selectedReceipt.data.driverCut.toLocaleString()} دج</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div><span className="text-slate-500">الزبون النهائي:</span> <strong className="text-slate-900">{selectedReceipt.data.endClient}</strong></div>
                      <div><span className="text-slate-500">المادة المباعة:</span> <strong className="text-slate-900">{selectedReceipt.data.materialType || "—"}</strong></div>
                      <div><span className="text-slate-500">منشأ الشحنة:</span> <strong className="text-slate-900">{selectedReceipt.data.originFactory || "—"}</strong></div>
                      <div><span className="text-slate-500">الوجهة المستهدفة:</span> <strong className="text-slate-900">{selectedReceipt.data.destination}</strong></div>
                      <div><span className="text-slate-500">الكمية الإجمالية:</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || "طن"}</strong></div>
                      <div><span className="text-slate-500">سعر شراء المصنع:</span> <strong className="text-slate-900">{selectedReceipt.data.factoryPurchasePrice.toLocaleString()} دج / {selectedReceipt.data.quantityUnit || "طن"}</strong></div>
                      <div><span className="text-slate-500">كلفة السلع الكلية:</span> <strong className="text-slate-900">{(selectedReceipt.data.factoryPurchasePrice * selectedReceipt.data.totalTonnage).toLocaleString()} دج</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>تحليل الهياكل والتسعير اللوجستي الشامل</span>
                        <span className="text-[10px] text-slate-400 font-mono">رقم: {selectedReceipt.data.id}</span>
                      </h4>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>كراء الشاحنة البرية:</span>
                        <span className="font-mono">{selectedReceipt.data.truckCost.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>أجرة السائق:</span>
                        <span className="font-mono">{selectedReceipt.data.driverCost.toLocaleString()} دج</span>
                      </div>
                      {(selectedReceipt.data.tripCount > 0 && selectedReceipt.data.tripUnitCost > 0) && (
                        <div className="flex justify-between py-1 text-slate-600">
                          <span>عدد الرحلات:</span>
                          <span className="font-mono">{selectedReceipt.data.tripCount} × {selectedReceipt.data.tripUnitCost.toLocaleString()} دج = {(selectedReceipt.data.tripCount * selectedReceipt.data.tripUnitCost).toLocaleString()} دج</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>هامش النقل الصريح:</span>
                        <span className="font-mono text-slate-700">+{selectedReceipt.data.explicitProfit.toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 font-bold bg-amber-50 px-2 rounded">
                        <span className="text-amber-800">الأرباح المستترة من التسعير:</span>
                        <span className="font-mono text-amber-700">
                          {+(selectedReceipt.data.clientSellingPrice - ((selectedReceipt.data.factoryPurchasePrice * selectedReceipt.data.totalTonnage) + selectedReceipt.data.truckCost + selectedReceipt.data.driverCost + selectedReceipt.data.explicitProfit)).toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900">
                        <span>سعر البيع النهائي الإجمالي:</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {selectedReceipt.data.clientSellingPrice.toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>المدفوع من الزبون:</span>
                        <span className="font-mono">{(selectedReceipt.data.clientPaid || 0).toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between py-1 font-bold">
                        <span className="text-slate-800">المتبقي على الزبون:</span>
                        <span className="font-mono text-amber-700">
                          {(selectedReceipt.data.clientSellingPrice - (selectedReceipt.data.clientPaid || 0)).toLocaleString()} دج
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>السائق ({selectedReceipt.data.driverName || "غير محدد"}) — المدفوع له:</span>
                        <span className="font-mono">{(selectedReceipt.data.driverPaid || 0).toLocaleString()} / {selectedReceipt.data.driverCost.toLocaleString()} دج</span>
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
                    <p className="font-bold mb-6 text-slate-700">اعتماد المسؤول</p>
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
