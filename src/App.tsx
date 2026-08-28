/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
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
  Sun,
  Moon,
  MapPin,
  Tag,
  Download,
  Upload,
  Factory
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

import { ClientTransportTrip, ClientTransportTripInput, MaterialResaleTx, MaterialResaleTxInput, OtherExpense, TabFilters } from "./types";
import { TRANSLATE_EXPENSE_CATEGORY, EXPENSE_CATEGORIES } from "./data";
import { useTrips } from "./hooks/useTrips";
import { useResales } from "./hooks/useResales";
import { useExpenses } from "./hooks/useExpenses";
import { useClientPayments } from "./hooks/useClientPayments";
import { useDriverPayments } from "./hooks/useDriverPayments";
import { useSupplierPayments } from "./hooks/useSupplierPayments";
import { useAppInfo } from "./hooks/useAppInfo";
import { ClientAccountsTab } from "./components/ClientAccountsTab";
import { DriverAccountsTab } from "./components/DriverAccountsTab";
import { SupplierAccountsTab } from "./components/SupplierAccountsTab";
import { ExecutiveOverviewTab } from "./components/ExecutiveOverviewTab";
import { chartTheme } from "./chart-theme";
import { tripClientFee, tripCompanyProfit } from "../server/trip-math";
import { downloadBackup, importBackup, resetAllData, fetchNextTripId, fetchNextResaleId, fetchNextExpenseId, fetchTripById, fetchResaleById } from "./api/client";
import logoUrl from "../assets/logo.png";
import { T } from "./strings";
import { calcResale } from "../server/resale-math";

// Algerian French-loanword month names, matching the receipt's existing date convention
const ALGERIAN_MONTHS = T.calendar.months;

function formatAlgerianDate(d: Date): string {
  return `${d.getDate()} ${ALGERIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Suggested units for the quantity field. The input is free-text, so anything
// else can be typed in — these are just the common ones.
const QUANTITY_UNITS = T.units.suggestions;

// Colored paid/remaining badge used in the trips and resales tables
function PaymentBadge({ paid, total }: { paid: number; total: number }) {
  const remaining = total - paid;
  return remaining <= 0 ? (
    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/30 text-emerald-400 border border-emerald-800/65">
      {T.badge.fullyPaid}
    </span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-900/40 text-amber-300 border border-amber-800">
      {T.badge.remaining} {remaining.toLocaleString()} {T.common.currency}
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
  const { payments: clientPayments, summaries: clientSummaries, recordPayment: recordClientPayment, updatePayment: updateClientPaymentRecord, removePayment: removeClientPaymentRecord, reload: reloadClientPayments } = useClientPayments(filters);
  const { payments: driverPayments, summaries: driverSummaries, recordPayment: recordDriverPayment, updatePayment: updateDriverPaymentRecord, removePayment: removeDriverPaymentRecord, reload: reloadDriverPayments } = useDriverPayments(filters);
  const { summaries: supplierSummaries, recordPayment: recordSupplierPayment, updatePayment: updateSupplierPaymentRecord, removePayment: removeSupplierPaymentRecord, addInvoice: addSupplierInvoice, updateInvoice: updateSupplierInvoiceRecord, removeInvoice: removeSupplierInvoiceRecord, deductAdvance: deductSupplierAdvance, reload: reloadSupplierPayments } = useSupplierPayments(filters);

  // Which build is running and which database file it opened — shown in the
  // header badge and in the reset dialog.
  const appInfo = useAppInfo();

  const refreshAllData = () => {
    reloadTrips();
    reloadResales();
    reloadClientPayments();
    reloadDriverPayments();
    reloadSupplierPayments();
  };

  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<"overview" | "transport" | "resale" | "clients" | "drivers" | "suppliers" | "expenses">("overview");

  // --- Modals State ---
  // Light / dark. index.html applies the stored choice before React mounts,
  // so the initial value is read back off the element instead of defaulting
  // to dark and flashing.
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark")
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Private/blocked storage: the choice simply does not outlive the session.
    }
  }, [theme]);

  const charts = chartTheme(theme);

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
    quantityUnit: T.common.defaultUnit,
    truckCost: 15000,
    driverCut: 10000,
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
    productUnitPrice: 4500,
    totalTonnage: 40,
    quantityUnit: T.common.defaultUnit,
    clientSellingPrice: 150000,
    truckCost: 18000,
    driverCost: 5000,
    explicitProfit: 0,
    driverName: "",
    tripCount: 1,
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
      const tripFee = tripClientFee(trip);
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
      const m = calcResale(tx);
      const driverWage = m.trips * tx.driverCost;

      tradingTurnover += m.invoiceTotal;
      capitalOutlay += m.totalBuyCost;
      totalTrueProfit += m.netRealProfit;
      totalTons += tx.totalTonnage;
      clientOutstanding += Math.max(0, tx.clientSellingPrice - (tx.clientPaid || 0));
      driverOutstanding += Math.max(0, driverWage - (tx.driverPaid || 0));
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

  // Actual cash position, taken from the client/driver ledgers (the same
  // all-time summaries the Client/Driver Accounts tabs use). This is
  // deliberately NOT scoped to the selected date range: a debt or credit
  // balance doesn't reset when the operator changes the month filter, and
  // scoping it by the trip's own date previously meant a payment recorded
  // against an older invoice silently vanished from this banner whenever the
  // filter moved to the current month.
  const periodCash = {
    collected: clientSummaries.reduce((sum, c) => sum + c.totalPaymentsReceived, 0),
    receivable: clientSummaries.reduce((sum, c) => sum + c.outstandingReceivable, 0),
    driverSettled: driverSummaries.reduce((sum, d) => sum + d.totalPaymentsGiven, 0),
    driverPayable: driverSummaries.reduce((sum, d) => sum + d.outstandingPayable, 0),
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
        quantityUnit: T.common.defaultUnit,
        truckCost: 15000,
        driverCut: 10000,
        companyProfit: 5000,
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
        productUnitPrice: 4500,
        totalTonnage: 40,
        quantityUnit: T.common.defaultUnit,
        clientSellingPrice: 180000,
        truckCost: 18000,
        driverCost: 5000,
        explicitProfit: 0,
        driverName: "",
        tripCount: 1,
      });
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
    } else {
      setExpenseForm({ ...record });
    }
    setIsModalOpen(true);
  };

  /**
   * Open a trip/resale record straight from a statement line. The loaded
   * lists obey the active date filter and the statement does not, so the
   * record is fetched by id instead of looked up in them.
   */
  const handleEditTripById = async (type: "transport" | "resale", id: string) => {
    try {
      const record = type === "transport" ? await fetchTripById(id) : await fetchResaleById(id);
      handleOpenEdit(record, type);
    } catch {
      alert(T.driverAccounts.tripNotFound(id));
    }
  };

  const handleDelete = async (id: string, type?: "transport" | "resale" | "expenses") => {
    if (!confirm(T.dialogs.confirmDelete)) return;
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
      alert(T.dialogs.deleteFailed(err.message));
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
          quantityUnit: tripForm.quantityUnit || T.common.defaultUnit,
          truckCost: Number(tripForm.truckCost) || 0,
          driverCut: Number(tripForm.driverCut) || 0,
          companyProfit: computedFormCompanyProfit,
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
          productUnitPrice: Number(resaleForm.productUnitPrice) || 0,
          totalTonnage: Number(resaleForm.totalTonnage) || 0,
          quantityUnit: resaleForm.quantityUnit || T.common.defaultUnit,
          truckCost: Number(resaleForm.truckCost) || 0,
          driverCost: Number(resaleForm.driverCost) || 0,
          explicitProfit: resaleCalc.marginPerTrip,
          driverName: resaleForm.driverName || "",
          tripCount: Math.max(1, Number(resaleForm.tripCount) || 1),
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
          truckPlate: expenseForm.truckPlate || T.expenses.unknownPlate,
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
      alert(T.dialogs.saveFailed(err.message));
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
      document.title = `${T.dialogs.receiptFilePrefix}-${selectedReceipt.data.id}`;
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

    if (!window.confirm(T.dialogs.confirmImport)) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importBackup(parsed);
      const { client_trips = 0, material_resales = 0, expenses: expensesCount = 0 } = result.imported;
      alert(T.dialogs.importSucceeded(client_trips, material_resales, expensesCount));
      window.location.reload();
    } catch (err: any) {
      alert(T.dialogs.importFailed(err.message));
    }
  };

  // --- Wipe the database ---
  // Deliberately gated behind a typed word rather than a plain confirm(): this
  // deletes every record and cannot be undone, and it is reachable from the
  // main header where a stray click is otherwise easy.
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetTyped, setResetTyped] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleResetConfirm = async () => {
    if (resetTyped.trim() !== T.reset.confirmWord) return;
    setResetting(true);
    try {
      const result = await resetAllData();
      alert(T.reset.done(result.total));
      window.location.reload();
    } catch (err: any) {
      alert(T.reset.failed(err.message));
      setResetting(false);
    }
  };

  // Stacked chart data formatting for Tab 1 Cost breakdown
  const tab1ChartData = useMemo(() => {
    return filteredClientTrips.slice(0, 10).map(trip => ({
      name: trip.id,
      [T.charts.truckCost]: trip.truckCost,
      [T.charts.driverDue]: trip.driverCut,
      [T.charts.companyMargin]: trip.companyProfit,
    })).reverse();
  }, [filteredClientTrips]);

  // Chart data for Tab 2 sourcing vs resale combo comparison
  const tab2ChartData = useMemo(() => {
    return filteredResaleTxs.slice(0, 10).map(tx => {
      const m = calcResale(tx);
      return {
        name: tx.id,
        [T.charts.materialPurchaseCost]: m.totalBuyCost,
        [T.charts.finalSellingPrice]: tx.clientSellingPrice,
        [T.charts.actualTotalProfit]: m.netRealProfit
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-blue-600 selection:text-white" dir="rtl">

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
                <img src={logoUrl} alt={T.header.logoAlt} className="h-16 w-auto max-w-[150px] object-contain shrink-0" />
                <div>
                  <h1 className="text-2xl font-bold font-display text-slate-950">{T.brand.companyName}</h1>
                  <p className="text-xs text-slate-500">{T.facture.subtitle}</p>
                  <p className="text-xs text-slate-600">{T.facture.systemDateLabel} {formatAlgerianDate(new Date())}</p>
                </div>
              </div>
              <div className="text-left">
                <div className="bg-slate-200 text-slate-900 border border-slate-400 px-4 py-2 font-mono text-lg font-bold rounded">
                  {selectedReceipt.data.id}
                </div>
                <p className="text-xs text-slate-500 mt-1">{T.facture.transportDateLabel} {selectedReceipt.data.date}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-600">
                    {selectedReceipt.type === "transport" ? T.facture.clientLabel : T.facture.endClientLabel}
                  </span>{" "}
                  <strong className="text-slate-900">
                    {selectedReceipt.type === "transport" ? selectedReceipt.data.clientName : selectedReceipt.data.endClient}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-600">{T.facture.quantityLabel}</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || T.common.defaultUnit}</strong>
                </div>
                <div>
                  <span className="text-slate-600">{T.facture.materialLabel}</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.materialType || "—"}</strong>
                </div>
                <div>
                  <span className="text-slate-600">{T.facture.originLabel}</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.originFactory || "—"}</strong>
                </div>
                <div>
                  <span className="text-slate-600">{T.facture.destinationLabel}</span>{" "}
                  <strong className="text-slate-900">{selectedReceipt.data.destination || "—"}</strong>
                </div>
                {selectedReceipt.data.driverName && (
                  <div>
                    <span className="text-slate-600">{T.facture.driverLabel}</span>{" "}
                    <strong className="text-slate-900">{selectedReceipt.data.driverName}</strong>
                  </div>
                )}
              </div>
            </div>

            {(() => {
              const factureTotal = selectedReceipt.type === "transport"
                ? tripClientFee(selectedReceipt.data)
                : selectedReceipt.data.clientSellingPrice;
              const facturePaid = selectedReceipt.data.clientPaid || 0;
              const factureRemaining = factureTotal - facturePaid;

              if (selectedReceipt.type === "resale") {
                // Two priced lines, each stated as quantity × unit price and
                // each multiplying out exactly to its own total, because the
                // invoice total is built FROM these lines rather than being
                // typed independently and split afterwards.
                const m = calcResale(selectedReceipt.data);
                const qty = selectedReceipt.data.totalTonnage || 0;
                const unit = selectedReceipt.data.quantityUnit || T.common.defaultUnit;
                const productUnitPrice = selectedReceipt.data.productUnitPrice || 0;
                return (
                  <div className="bg-slate-100 border-2 border-slate-800 rounded-lg p-6 space-y-3">
                    {/* Line 1 — the goods */}
                    <div className="flex justify-between items-start text-sm">
                      <div className="text-slate-700">
                        <div className="font-bold">{selectedReceipt.data.materialType || T.facture.goodsLineFallback}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {qty.toLocaleString()} {unit} × {productUnitPrice.toLocaleString()} {T.common.currency}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{m.totalSellRevenue.toLocaleString()} {T.common.currency}</span>
                    </div>

                    {/* Line 2 — the delivery */}
                    <div className="flex justify-between items-start text-sm border-t border-slate-300 pt-2">
                      <div className="text-slate-700">
                        <div className="font-bold">{T.facture.transportLineTitle}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {m.trips} {T.facture.tripsUnit} × {m.costPerTrip.toLocaleString()} {T.common.currency}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-slate-900">{m.transportTotal.toLocaleString()} {T.common.currency}</span>
                    </div>

                    <div className="flex justify-between items-center border-t-2 border-slate-800 pt-2">
                      <span className="text-base font-bold text-slate-900">{T.facture.grandTotalLabel}</span>
                      <span className="text-2xl font-mono font-bold text-slate-950">{factureTotal.toLocaleString()} {T.common.currency}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                      <span className="text-slate-700">{T.facture.paidLabel}</span>
                      <span className="font-mono font-bold text-slate-900">{facturePaid.toLocaleString()} {T.common.currency}</span>
                    </div>
                    <div className="flex justify-between items-center text-base">
                      <span className="font-bold text-slate-900">{T.facture.remainingLabel}</span>
                      <span className="font-mono font-bold text-slate-950">{factureRemaining.toLocaleString()} {T.common.currency}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-slate-100 border-2 border-slate-800 rounded-lg p-6 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-700">{T.facture.transportPriceLabel}</span>
                    <span className="font-mono font-bold text-slate-900">{factureTotal.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-300 pt-2">
                    <span className="text-base font-bold text-slate-900">{T.facture.grandTotalLabel}</span>
                    <span className="text-2xl font-mono font-bold text-slate-950">{factureTotal.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-slate-300 pt-2">
                    <span className="text-slate-700">{T.facture.paidLabel}</span>
                    <span className="font-mono font-bold text-slate-900">{facturePaid.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="font-bold text-slate-900">{T.facture.remainingLabel}</span>
                    <span className="font-mono font-bold text-slate-950">{factureRemaining.toLocaleString()} {T.common.currency}</span>
                  </div>
                </div>
              );
            })()}

            <div className="border-t border-slate-800 pt-8 flex justify-between text-xs">
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">{T.facture.signDriverAndManager}</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
              </div>
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">{T.facture.signClientStamp}</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
              </div>
              <div className="text-center w-1/3">
                <p className="font-bold mb-8">{T.printCommon.approvedBy}</p>
                <div className="h-0.5 bg-slate-300 w-32 mx-auto"></div>
                <p className="font-mono text-[10px] text-slate-500 mt-1">{T.brand.signatureName}</p>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 border-t border-slate-200 pt-4 font-mono">
              {T.facture.footerNote}
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
                <div className="h-12 px-2.5 rounded-2xl bg-[#f8faef] border border-slate-700/40 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <img src={logoUrl} alt={T.header.logoAlt} className="h-9 w-auto max-w-[120px] object-contain" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight font-display bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2">
                    <span>{T.brand.companyName}</span>
                    <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-sans tracking-wide">{T.brand.safeModeBadge}</span>
                    {/* Build identity. The single fastest way to tell whether a
                        machine is running the current build — if this badge is
                        missing entirely, it is an old install. */}
                    <span
                      title={appInfo ? T.header.versionTitle(appInfo.buildId, appInfo.databaseFile) : undefined}
                      className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-0.5 rounded-full font-sans tracking-wide cursor-help"
                    >
                      {T.header.versionLabel}{" "}
                      {/* dir="ltr" so "1.1.0" is not reordered by the RTL layout */}
                      <span dir="ltr" className="font-mono">
                        {appInfo ? appInfo.appVersion : T.header.versionLoading}
                      </span>
                    </span>
                  </h1>
                  <p className="text-xs text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                    <Compass className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span>{T.brand.tagline}</span>
                  </p>
                </div>
              </div>

              {/* Status Indicator & Offline Badge */}
              <div className="flex items-center gap-2">
                <div className="hidden md:flex flex-col text-left px-3 py-1 bg-slate-800 border border-slate-700/80 rounded-lg text-xs leading-tight">
                  <span className="text-slate-400 font-sans text-right">{T.brand.managerLabel}</span>
                  <span className="text-slate-100 font-mono font-bold">{T.brand.managerName}</span>
                </div>

                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title={theme === "dark" ? T.header.themeToLight : T.header.themeToDark}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  {theme === "dark"
                    ? <Sun className="h-3.5 w-3.5 text-amber-400" />
                    : <Moon className="h-3.5 w-3.5 text-blue-400" />}
                  <span className="hidden lg:inline">{theme === "dark" ? T.header.themeToLight : T.header.themeToDark}</span>
                </button>

                <button
                  onClick={handleExportBackup}
                  title={T.header.exportBackupTitle}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{T.header.exportBackup}</span>
                </button>
                <button
                  onClick={handleImportClick}
                  title={T.header.importBackupTitle}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{T.header.importBackup}</span>
                </button>
                <button
                  onClick={() => { setResetTyped(""); setIsResetOpen(true); }}
                  title={T.header.resetDataTitle}
                  className="flex items-center gap-1.5 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-900 text-rose-300 text-xs px-3 py-1.5 rounded-lg transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{T.header.resetData}</span>
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
                  <span className="font-bold text-slate-300">{T.master.periodBadge}</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 font-display">
                  {T.master.title}
                </h2>

                {/* Mathematical visual schema */}
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">{T.master.transportProfit}</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab1Stats.netMargin.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">+</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">{T.master.resaleProfit}</span>
                    <span className="text-emerald-400 font-bold font-mono">+{tab2Stats.totalTrueProfit.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <span className="text-slate-600 font-bold text-lg">-</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500">{T.master.fleetExpenses}</span>
                    <span className="text-rose-400 font-bold font-mono">-{tab3Stats.totalOverhead.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <span className="text-slate-500 font-bold text-lg">=</span>
                  <div className="bg-slate-800/40 px-3 py-1 rounded border border-slate-700 flex flex-col">
                    <span className="text-[10px] text-cyan-400 font-bold">{T.master.netProfit}</span>
                    <span className={`font-mono font-bold text-base ${masterNetProfit >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                      {masterNetProfit.toLocaleString()} {T.common.currency}
                    </span>
                  </div>
                </div>

                {/* Actual cash position — profit above is accrued, this is what
                    has really been collected/paid according to the ledgers. */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">{T.master.cashCollected}</span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">{periodCash.collected.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">{T.master.cashReceivable}</span>
                    <span className="text-amber-400 font-bold font-mono text-sm">{periodCash.receivable.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">{T.master.driverPaid}</span>
                    <span className="text-blue-400 font-bold font-mono text-sm">{periodCash.driverSettled.toLocaleString()} {T.common.currency}</span>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <span className="text-[10px] text-slate-500 block">{T.master.driverPayable}</span>
                    <span className="text-rose-400 font-bold font-mono text-sm">{periodCash.driverPayable.toLocaleString()} {T.common.currency}</span>
                  </div>
                </div>
              </div>

              {/* High impact visualization counter */}
              <div className="lg:col-span-4 bg-slate-800/50 border border-slate-800 rounded-2xl p-5 text-center flex flex-col justify-center items-center">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{T.master.periodProfitTitle}</p>

                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-4xl font-black font-mono tracking-tight ${masterNetProfit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(34,197,94,0.2)]' : 'text-rose-500'}`}>
                    {masterNetProfit.toLocaleString()}
                  </span>
                  <span className="text-sm text-slate-400">{T.common.currency}</span>
                </div>

                <p className="mt-1 text-[10px] text-slate-500">{T.master.accrualNote}</p>

                <div className="mt-3 flex items-center justify-center gap-1.5 py-1 px-3.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  {masterNetProfit >= 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                      <span>{T.master.healthy}</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 text-rose-400 animate-bounce" />
                      <span className="text-rose-300">{T.master.unhealthy}</span>
                    </>
                  )}
                </div>

                {periodCash.receivable > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 py-1 px-3 rounded-full bg-amber-950/40 border border-amber-900/60 text-[10px] text-amber-300">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{periodCash.receivable.toLocaleString()} {T.common.currency} {T.master.uncollectedSuffix}</span>
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
                  placeholder={T.filters.searchPlaceholder}
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
                <span className="text-slate-500 text-xs">{T.filters.dateTo}</span>
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
                title={T.filters.resetTo(ALGERIAN_MONTHS[new Date().getMonth()], new Date().getFullYear())}
              >
                {T.filters.clear}
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
                <span>{T.tabs.overview}</span>
              </button>

              <button
                onClick={() => { setActiveTab("transport"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "transport"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Truck className="h-3.5 w-3.5" />
                <span>{T.tabs.transport}</span>
              </button>

              <button
                onClick={() => { setActiveTab("resale"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "resale"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>{T.tabs.resale}</span>
              </button>

              <button
                onClick={() => { setActiveTab("clients"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "clients"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                <span>{T.tabs.clients}</span>
              </button>

              <button
                onClick={() => { setActiveTab("drivers"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "drivers"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Truck className="h-3.5 w-3.5 text-cyan-400" />
                <span>{T.tabs.drivers}</span>
              </button>

              <button
                onClick={() => { setActiveTab("suppliers"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "suppliers"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Factory className="h-3.5 w-3.5 text-amber-400" />
                <span>{T.tabs.suppliers}</span>
              </button>

              <button
                onClick={() => { setActiveTab("expenses"); resetFilters(); }}
                className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${activeTab === "expenses"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                <span>{T.tabs.expenses}</span>
              </button>

            </div>

          </div>
        </section>

        {/* CONTAINER CONTENT ACCORDING TO TABS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">

            {/* TAB OVERVIEW: EXECUTIVE DASHBOARD */}
            {activeTab === "overview" && (
              <div key="tab-overview" className="">
                <ExecutiveOverviewTab
                  trips={clientTrips}
                  resales={resaleTxs}
                  expenses={expenses}
                  clientSummaries={clientSummaries}
                  driverSummaries={driverSummaries}
                  onNavigateTab={tab => setActiveTab(tab)}
                  charts={charts}
                />
              </div>
            )}

            {/* TAB CLIENTS: CLIENT ACCOUNTS & RECEIVABLES */}
            {activeTab === "clients" && (
              <div key="tab-clients" className="">
                <ClientAccountsTab
                  summaries={clientSummaries}
                  loading={false}
                  filters={filters}
                  onRecordPayment={recordClientPayment}
                  onUpdatePayment={updateClientPaymentRecord}
                  onDeletePayment={removeClientPaymentRecord}
                  onRefreshTrips={refreshAllData}
                />
              </div>
            )}

            {/* TAB DRIVERS: DRIVER ACCOUNTS & SETTLEMENTS */}
            {activeTab === "drivers" && (
              <div key="tab-drivers" className="">
                <DriverAccountsTab
                  summaries={driverSummaries}
                  loading={false}
                  filters={filters}
                  onRecordPayment={recordDriverPayment}
                  onUpdatePayment={updateDriverPaymentRecord}
                  onDeletePayment={removeDriverPaymentRecord}
                  onEditTrip={handleEditTripById}
                  onRefreshTrips={refreshAllData}
                />
              </div>
            )}

            {/* TAB SUPPLIERS: SUPPLIER/FACTORY BALANCES & DEBTS */}
            {activeTab === "suppliers" && (
              <div key="tab-suppliers" className="">
                <SupplierAccountsTab
                  summaries={supplierSummaries}
                  loading={false}
                  filters={filters}
                  onRecordPayment={recordSupplierPayment}
                  onUpdatePayment={updateSupplierPaymentRecord}
                  onDeletePayment={removeSupplierPaymentRecord}
                  onRecordInvoice={addSupplierInvoice}
                  onUpdateInvoice={updateSupplierInvoiceRecord}
                  onDeleteInvoice={removeSupplierInvoiceRecord}
                  onDeductAdvance={deductSupplierAdvance}
                  onRefresh={refreshAllData}
                />
              </div>
            )}

            {/* TAB 1: CLIENT TRANSPORT (شحن لصالح العملاء) */}
            {activeTab === "transport" && (
              <div key="tab-transport" className="space-y-6">
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{T.transport.kpiTripCount}</span>
                    <span className="text-3xl font-black font-mono text-blue-400 block mt-1">{filteredClientTrips.length}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">{T.transport.kpiTripCountHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.transport.kpiRevenue}</span>
                      <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab1Stats.grossRevenue.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.transport.kpiRevenueHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.transport.kpiDriverWages}</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">{tab1Stats.driverPayout.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.transport.kpiDriverWagesHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.transport.kpiNetMargin}</span>
                      <PiggyBank className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-cyan-300 block mt-1">{tab1Stats.netMargin.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.transport.kpiNetMarginHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.transport.kpiClientOutstanding}</span>
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-amber-400 block mt-1">{tab1Stats.clientOutstanding.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.transport.kpiClientOutstandingHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.transport.kpiDriverOutstanding}</span>
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab1Stats.driverOutstanding.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.transport.kpiDriverOutstandingHint}</span>
                  </div>
                </div>

                {/* Main workspace: records table first (full width), chart below */}
                <div className="flex flex-col gap-6">

                  {/* Cost Split stacked bar chart */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 mb-1">{T.transport.chartTitle}</h4>
                      <p className="text-[10px] text-slate-400 mb-4">{T.transport.chartSubtitle}</p>
                    </div>

                    <div className="h-60 w-full relative">
                      {tab1ChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">{T.transport.chartEmpty}</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={tab1ChartData} layout="vertical" margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={charts.grid} />
                            <XAxis type="number" stroke={charts.axis} fontSize={9} />
                            <YAxis type="category" dataKey="name" stroke={charts.axis} fontSize={9} width={45} />
                            <Tooltip contentStyle={{ background: charts.tooltipBg, border: `1px solid ${charts.tooltipBorder}`, color: charts.tooltipText }} />
                            <Bar dataKey={T.charts.truckCost} stackId="a" fill="#3b82f6" />
                            <Bar dataKey={T.charts.driverDue} stackId="a" fill="#10b981" />
                            <Bar dataKey={T.charts.companyMargin} stackId="a" fill="#06b6d4" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="flex gap-2 text-[10px] text-slate-400 mt-4 justify-around bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
                        <span>{T.transport.legendTrucks}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                        <span>{T.transport.legendDrivers}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#06b6d4]"></span>
                        <span>{T.transport.legendProfit}</span>
                      </div>
                    </div>
                  </div>

                  {/* Shipment/Cargo Table Ledger */}
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-100">{T.transport.tableTitle}</h4>
                        <button
                          onClick={() => handleOpenAdd("transport")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{T.transport.addButton}</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">{T.transport.colId}</th>
                              <th className="p-3">{T.transport.colDate}</th>
                              <th className="p-3">{T.transport.colClientMaterial}</th>
                              <th className="p-3">{T.transport.colRouteDetails}</th>
                              <th className="p-3">{T.transport.colQuantity}</th>
                              <th className="p-3">{T.transport.colTotalFee}</th>
                              <th className="p-3">{T.transport.colClientPayments}</th>
                              <th className="p-3">{T.transport.colDriverPayments}</th>
                              <th className="p-3 text-left">{T.transport.colTools}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredClientTrips.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-6 text-center text-slate-500">{T.transport.empty}</td>
                              </tr>
                            ) : (
                              filteredClientTrips.map(trip => {
                                const totalCost = tripClientFee(trip);
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
                                        <span className="text-xs">{T.transport.routeFrom}</span>
                                        <span className="text-slate-400">{trip.originFactory}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-cyan-400">{T.transport.routeTo}</span>
                                        <span className="text-slate-400">{trip.destination}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 font-mono text-slate-100">{trip.totalTonnage} {trip.quantityUnit || T.common.defaultUnit}</td>
                                    <td className="p-3 font-mono font-bold text-emerald-400">{totalCost.toLocaleString()} {T.common.currency}</td>
                                    <td className="p-3">
                                      <div className="font-mono text-slate-300">{(trip.clientPaid || 0).toLocaleString()} {T.common.currency}</div>
                                      <div className="mt-1"><PaymentBadge paid={trip.clientPaid || 0} total={totalCost} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{trip.driverName || "—"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {(trip.driverPaid || 0).toLocaleString()} / {trip.driverCut.toLocaleString()} {T.common.currency}
                                      </div>
                                      <div className="mt-1"><PaymentBadge paid={trip.driverPaid || 0} total={trip.driverCut} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5 justify-end">

                                        <button
                                          onClick={() => handleOpenReceipt("transport", trip)}
                                          className="p-1 px-2.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 transition flex items-center gap-1"
                                          title={T.transport.receiptButtonTitle}
                                        >
                                          <Printer className="h-3 w-3" />
                                          <span>{T.transport.receiptButton}</span>
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
              </div>
            )}

            {/* TAB 2: MATERIAL RESALE (شراء وإعادة بيع المواد) */}
            {activeTab === "resale" && (
              <div key="tab-resale" className="space-y-6">
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{T.resale.kpiTurnover}</span>
                    <span className="text-3xl font-black font-mono text-cyan-400 block mt-1">{tab2Stats.tradingTurnover.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.resale.kpiTurnoverHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.resale.kpiCapital}</span>
                      <TrendingDown className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab2Stats.capitalOutlay.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.resale.kpiCapitalHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.resale.kpiVisibleTransport}</span>
                      <DollarSign className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-400 block mt-1">
                      {filteredResaleTxs.reduce((sum, tx) => sum + calcResale(tx).transportTotal, 0).toLocaleString()} {T.common.currency}
                    </span>
                    <span className="text-[10px] text-slate-500">{T.resale.kpiVisibleTransportHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.resale.kpiTrueProfit}</span>
                      <ProfitIcon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400 block mt-1">{tab2Stats.totalTrueProfit.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500 mt-1 flex items-center gap-0.5 text-xs text-slate-300">
                      <Info className="h-3 w-3 inline text-emerald-400" />
                      <span>{T.resale.kpiTrueProfitHint}</span>
                    </span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.resale.kpiClientOutstanding}</span>
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-amber-400 block mt-1">{tab2Stats.clientOutstanding.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.resale.kpiClientOutstandingHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{T.resale.kpiDriverOutstanding}</span>
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="text-2xl font-black font-mono text-rose-400 block mt-1">{tab2Stats.driverOutstanding.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-500">{T.resale.kpiDriverOutstandingHint}</span>
                  </div>
                </div>

                {/* Main workspace: records table first (full width), chart below */}
                <div className="flex flex-col gap-6">

                  {/* Sourcing Cost vs Final selling Combo */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 mb-1">{T.resale.chartTitle}</h4>
                      <p className="text-[10px] text-slate-400 mb-4">{T.resale.chartSubtitle}</p>
                    </div>

                    <div className="h-64 w-full">
                      {tab2ChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">{T.resale.chartEmpty}</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={tab2ChartData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={charts.grid} />
                            <XAxis dataKey="name" stroke={charts.axis} fontSize={9} />
                            <YAxis stroke={charts.axis} fontSize={9} />
                            <Tooltip contentStyle={{ background: charts.tooltipBg, border: `1px solid ${charts.tooltipBorder}`, color: charts.tooltipText }} />
                            <Bar dataKey={T.charts.materialPurchaseCost} fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey={T.charts.finalSellingPrice} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                            <Line type="monotone" dataKey={T.charts.actualTotalProfit} stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="flex gap-2 text-[10px] text-slate-500 mt-2 justify-around">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>{T.resale.legendPurchase}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>{T.resale.legendSales}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span>{T.resale.legendProfit}</span>
                    </div>
                  </div>

                  {/* Resale ledger records */}
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-100">{T.resale.tableTitle}</h4>
                        <button
                          onClick={() => handleOpenAdd("resale")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{T.resale.addButton}</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">{T.resale.colId}</th>
                              <th className="p-3">{T.resale.colDate}</th>
                              <th className="p-3">{T.resale.colEndClient}</th>
                              <th className="p-3">{T.resale.colPricing}</th>
                              <th className="p-3">{T.resale.colHiddenMargin}</th>
                              <th className="p-3">{T.resale.colTrueProfit}</th>
                              <th className="p-3">{T.resale.colClientPayments}</th>
                              <th className="p-3">{T.resale.colDriverPayments}</th>
                              <th className="p-3 text-left">{T.resale.colTools}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredResaleTxs.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-6 text-center text-slate-500">{T.resale.empty}</td>
                              </tr>
                            ) : (
                              filteredResaleTxs.map(tx => {
                                const m = calcResale(tx);
                                const sourcingCost = m.totalBuyCost;
                                const goodsMargin = m.grossProductProfit;
                                const totalTrueProfit = m.netRealProfit;

                                return (
                                  <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                                    <td className="p-3 font-mono font-bold text-blue-400">{tx.id}</td>
                                    <td className="p-3 text-slate-300 font-mono">{tx.date}</td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{tx.endClient}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.totalTonnage} {tx.quantityUnit || T.common.defaultUnit} × {tx.factoryPurchasePrice} {T.common.currency}</div>
                                      {tx.destination && (
                                        <div className="text-[10px] text-slate-500 mt-0.5">{T.resale.cellDestination} {tx.destination}</div>
                                      )}
                                    </td>
                                    <td className="p-3 text-slate-300 font-mono">
                                      <div>{T.resale.cellSelling} {tx.clientSellingPrice.toLocaleString()}</div>
                                      <div className="text-[10px] text-slate-500">{T.resale.cellCost} {sourcingCost.toLocaleString()}</div>
                                    </td>
                                    <td className={`p-3 font-mono font-semibold ${goodsMargin >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                                      {goodsMargin.toLocaleString()} {T.common.currency}
                                    </td>
                                    <td className="p-3 font-mono font-bold text-emerald-400">
                                      {totalTrueProfit.toLocaleString()} {T.common.currency}
                                    </td>
                                    <td className="p-3">
                                      <div className="font-mono text-slate-300">{(tx.clientPaid || 0).toLocaleString()} {T.common.currency}</div>
                                      <div className="mt-1"><PaymentBadge paid={tx.clientPaid || 0} total={tx.clientSellingPrice} /></div>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-100">{tx.driverName || "—"}</div>
                                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {(tx.driverPaid || 0).toLocaleString()} / {tx.driverCost.toLocaleString()} {T.common.currency}
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
                                          <span>{T.transport.receiptButton}</span>
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
              </div>
            )}

            {/* TAB 3: OTHER EXPENSES (المصاريف الأخرى الأسطول) */}
            {activeTab === "expenses" && (
              <div key="tab-expenses" className="space-y-6">
                {/* Visual KPI Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">{T.expenses.kpiCount}</span>
                    <span className="text-3xl font-black font-mono text-rose-400 block mt-1">{filteredExpenses.length}</span>
                    <span className="text-[10px] text-slate-500">{T.expenses.kpiCountHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">{T.expenses.kpiTotal}</span>
                    <span className="text-3xl font-black font-mono text-rose-500 block mt-1">{tab3Stats.totalOverhead.toLocaleString()} {T.common.currency}</span>
                    <span className="text-[10px] text-slate-400">{T.expenses.kpiTotalHint}</span>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">{T.expenses.kpiPending}</span>
                    <span className="text-2xl font-black font-mono text-amber-500 block">
                      {tab3Stats.pendingTotal.toLocaleString()} {T.common.currency}
                    </span>
                    <span className="text-[10px] text-slate-500">{T.expenses.kpiPendingHint}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-6">

                  {/* Expense Breakdown Categories */}
                  <div className="order-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 mb-1">{T.expenses.chartTitle}</h4>
                      <p className="text-[10px] text-slate-400 mb-4">{T.expenses.chartSubtitle}</p>
                    </div>

                    <div className="h-56 w-full relative flex items-center justify-center">
                      {expensePieData.length === 0 ? (
                        <div className="text-xs text-slate-500">{T.expenses.chartEmpty}</div>
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
                            <Tooltip contentStyle={{ background: charts.tooltipBg, border: `1px solid ${charts.tooltipBorder}`, color: charts.tooltipText }} />
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
                          <span className="font-mono text-slate-400">({item.value.toLocaleString()} {T.common.currency})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Expenses Ledger */}
                  <div className="order-1 bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[26rem]">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-100">{T.expenses.tableTitle}</h4>
                        <button
                          onClick={() => handleOpenAdd("expenses")}
                          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition font-bold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{T.expenses.addButton}</span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950">
                              <th className="p-3">{T.expenses.colId}</th>
                              <th className="p-3">{T.expenses.colDate}</th>
                              <th className="p-3">{T.expenses.colCategory}</th>
                              <th className="p-3">{T.expenses.colPlate}</th>
                              <th className="p-3">{T.expenses.colAmount}</th>
                              <th className="p-3">{T.expenses.colStatus}</th>
                              <th className="p-3 text-left">{T.expenses.colTools}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredExpenses.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">{T.expenses.empty}</td>
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
                                  <td className="p-3 font-mono font-bold text-rose-400">{exp.amount.toLocaleString()} {T.common.currency}</td>
                                  <td className="p-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${exp.status === "Paid"
                                      ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/65"
                                      : "bg-amber-900/40 text-amber-300 border border-amber-800"
                                      }`}>
                                      {exp.status === "Paid" ? T.expenses.statusPaid : T.expenses.statusPendingShort}
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
              </div>
            )}

        </section>

      </div>

      {/* RENDER MODAL: WIPE THE DATABASE (irreversible — typed confirmation) */}
      {isResetOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex dialog-scroll justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/70 max-w-md w-full rounded-2xl overflow-hidden p-6 shadow-2xl relative dir-rtl">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 to-red-500"></div>

            <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2 mb-3">
              <Trash2 className="h-4.5 w-4.5 text-rose-500" />
              {T.reset.title}
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed mb-2">{T.reset.body}</p>
            <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2 mb-3">
              {T.reset.backupHint}
            </p>

            {/* Name the exact file about to be wiped. On a machine with more
                than one Windows account there is more than one database, and
                this is where knowing which one matters most. */}
            {appInfo && (
              <p className="text-[10px] text-slate-500 mb-4 break-all">
                {T.reset.databaseFileLabel}{" "}
                <span dir="ltr" className="font-mono text-slate-400">{appInfo.databaseFile}</span>
              </p>
            )}

            <label className="block text-xs text-slate-400 mb-1">
              {T.reset.confirmPrompt(T.reset.confirmWord)}
            </label>
            <input
              type="text"
              autoFocus
              value={resetTyped}
              onChange={e => setResetTyped(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-slate-100 font-bold mb-5"
            />

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setIsResetOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {T.reset.cancel}
              </button>
              <button
                type="button"
                disabled={resetting || resetTyped.trim() !== T.reset.confirmWord}
                onClick={handleResetConfirm}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition"
              >
                {resetting ? T.reset.working : T.reset.submit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDER MODAL: FOR ADD/EDIT WORKFLOW */}
        {isModalOpen && (
          <div className="no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex dialog-scroll justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 max-w-lg w-full rounded-2xl overflow-hidden p-6 shadow-2xl relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-5">
                <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                  <Truck className="h-4.5 w-4.5 text-blue-500" />
                  <span>
                    {modalType === "add" ? T.form.titleAdd : T.form.titleEdit}
                  </span>
                  <span className="text-xs font-normal text-slate-400">
                    ({modalRecordType === "transport" ? T.form.kindTransport : modalRecordType === "resale" ? T.form.kindResale : T.form.kindExpense})
                  </span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
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
              <form onSubmit={handleSubmit} className="space-y-4">

                {modalRecordType === "transport" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">{T.form.tripId}</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={tripForm.id}
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
                            onChange={e => setTripForm(p => ({ ...p, truckCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">{T.form.driverWage}</label>
                          <input
                            type="number"
                            required
                            value={tripForm.driverCut}
                            onChange={e => setTripForm(p => ({ ...p, driverCut: parseInt(e.target.value) || 0 }))}
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

                {modalRecordType === "resale" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">{T.form.resaleId}</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={resaleForm.id}
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
                          onChange={e => setResaleForm(p => ({ ...p, factoryPurchasePrice: parseInt(e.target.value) || 0 }))}
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
                            onChange={e => setResaleForm(p => ({ ...p, truckCost: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">{T.form.resaleDriverCost}</label>
                          <input
                            type="number"
                            required
                            value={resaleForm.driverCost}
                            onChange={e => setResaleForm(p => ({ ...p, driverCost: parseInt(e.target.value) || 0 }))}
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

                {modalRecordType === "expenses" && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">{T.form.expenseId}</label>
                        <input
                          type="text"
                          required
                          disabled={modalType === "edit"}
                          value={expenseForm.id}
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
                          onChange={e => setExpenseForm(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
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
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                  >
                    {T.form.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/10 transition"
                  >
                    {T.form.save}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

      {/* RENDER MODAL: BILINGUAL RECEIPT VIEW & TRIGGER Browser PRINT */}
        {isReceiptOpen && selectedReceipt && (
          <div className="no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex dialog-scroll justify-center p-4">
            <div className="paper-surface bg-white text-slate-900 border border-slate-200 max-w-3xl w-full rounded-2xl p-6 shadow-2xl relative">

              <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4 no-print">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Printer className="h-4 w-4 text-emerald-600 animate-pulse" />
                  <span>{T.receiptPreview.header}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition shadow"
                  >
                    <Printer className="h-4 w-4" />
                    <span>{T.receiptPreview.printButton}</span>
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
                    <h2 className="text-xl font-bold font-display text-slate-950">{T.brand.companyName}</h2>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase">{T.receiptPreview.docSubtitle}</p>
                    <p className="text-xs text-slate-600">{T.facture.systemDateLabel} {formatAlgerianDate(new Date())}</p>
                  </div>
                  <div className="text-left">
                    <span className="bg-slate-200 text-slate-900 text-sm font-mono font-black border border-slate-400 px-3 py-1 rounded">
                      {selectedReceipt.data.id}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1.5">{T.facture.transportDateLabel} {selectedReceipt.data.date}</p>
                  </div>
                </div>

                {selectedReceipt.type === "transport" ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div><span className="text-slate-500">{T.facture.clientLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.clientName}</strong></div>
                      <div><span className="text-slate-500">{T.facture.materialLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.materialType}</strong></div>
                      <div><span className="text-slate-500">{T.facture.originLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.originFactory}</strong></div>
                      <div><span className="text-slate-500">{T.facture.destinationLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.destination}</strong></div>
                      <div><span className="text-slate-500">{T.facture.quantityLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || T.common.defaultUnit}</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>{T.receiptPreview.costSheetTitle}</span>
                        <span className="text-[9px] text-slate-400">{T.receiptPreview.currencyNote}</span>
                      </h4>
                      {/* One priced line. The driver's wage and the company's
                          margin come out of this figure and are no business of
                          the client's, so they are not on their invoice. */}
                      <div className="flex justify-between py-1 text-slate-600">
                        <span>{T.receiptPreview.truckHire}</span>
                        <span className="font-mono">{tripClientFee(selectedReceipt.data).toLocaleString()} {T.common.currency}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900 bg-slate-105">
                        <span>{T.receiptPreview.invoiceTotal}</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {tripClientFee(selectedReceipt.data).toLocaleString()} {T.common.currency}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>{T.receiptPreview.clientPaid}</span>
                        <span className="font-mono">{(selectedReceipt.data.clientPaid || 0).toLocaleString()} {T.common.currency}</span>
                      </div>
                      <div className="flex justify-between py-1 font-bold">
                        <span className="text-slate-800">{T.receiptPreview.clientRemaining}</span>
                        <span className="font-mono text-amber-700">
                          {(tripClientFee(selectedReceipt.data) - (selectedReceipt.data.clientPaid || 0)).toLocaleString()} {T.common.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-y-2">
                      <div><span className="text-slate-500">{T.facture.endClientLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.endClient}</strong></div>
                      <div><span className="text-slate-500">{T.receiptPreview.soldMaterialLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.materialType || "—"}</strong></div>
                      <div><span className="text-slate-500">{T.facture.originLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.originFactory || "—"}</strong></div>
                      <div><span className="text-slate-500">{T.facture.destinationLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.destination}</strong></div>
                      <div><span className="text-slate-500">{T.facture.quantityLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.totalTonnage} {selectedReceipt.data.quantityUnit || T.common.defaultUnit}</strong></div>
                      <div><span className="text-slate-500">{T.receiptPreview.factoryPriceLabel}</span> <strong className="text-slate-900">{selectedReceipt.data.factoryPurchasePrice.toLocaleString()} {T.common.currency} / {selectedReceipt.data.quantityUnit || T.common.defaultUnit}</strong></div>
                      <div><span className="text-slate-500">{T.receiptPreview.goodsTotalCostLabel}</span> <strong className="text-slate-900">{(selectedReceipt.data.factoryPurchasePrice * selectedReceipt.data.totalTonnage).toLocaleString()} {T.common.currency}</strong></div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1 flex items-center justify-between">
                        <span>{T.receiptPreview.pricingAnalysisTitle}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{T.receiptPreview.recordNoLabel} {selectedReceipt.data.id}</span>
                      </h4>
                      {/* Internal sheet, so the per-trip arithmetic is spelled
                          out — all of it from the shared resale math, never
                          re-derived here. */}
                      {(() => {
                        const m = calcResale(selectedReceipt.data);
                        return (
                          <>
                            <div className="flex justify-between py-1 text-slate-600">
                              <span>{T.receiptPreview.truckHireLong}</span>
                              <span className="font-mono">{m.costPerTrip.toLocaleString()} {T.common.currency}</span>
                            </div>
                            <div className="flex justify-between py-1 text-slate-600">
                              <span>{T.receiptPreview.driverWage}</span>
                              <span className="font-mono">{(selectedReceipt.data.driverCost || 0).toLocaleString()} {T.common.currency}</span>
                            </div>
                            <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100 pt-2">
                              <span>{T.receiptPreview.tripCountLabel}</span>
                              <span className="font-mono">
                                {m.trips} × {m.costPerTrip.toLocaleString()} {T.common.currency} = {m.transportTotal.toLocaleString()} {T.common.currency}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 text-slate-600">
                              <span>{T.receiptPreview.explicitTransportMargin}</span>
                              <span className="font-mono text-slate-700">+{m.marginPerTrip.toLocaleString()} {T.common.currency}</span>
                            </div>
                            <div className="flex justify-between py-1 text-slate-600 font-bold bg-emerald-50 px-2 rounded">
                              <span className="text-emerald-800">{T.receiptPreview.netRealProfit}</span>
                              <span className="font-mono text-emerald-700">{m.netRealProfit.toLocaleString()} {T.common.currency}</span>
                            </div>
                          </>
                        );
                      })()}
                      <div className="flex justify-between py-1.5 border-t border-slate-200 font-extrabold text-slate-900">
                        <span>{T.receiptPreview.finalSellingTotal}</span>
                        <span className="font-mono text-emerald-600 text-sm">
                          {selectedReceipt.data.clientSellingPrice.toLocaleString()} {T.common.currency}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>{T.receiptPreview.buyerPaid}</span>
                        <span className="font-mono">{(selectedReceipt.data.clientPaid || 0).toLocaleString()} {T.common.currency}</span>
                      </div>
                      <div className="flex justify-between py-1 font-bold">
                        <span className="text-slate-800">{T.receiptPreview.buyerRemaining}</span>
                        <span className="font-mono text-amber-700">
                          {(selectedReceipt.data.clientSellingPrice - (selectedReceipt.data.clientPaid || 0)).toLocaleString()} {T.common.currency}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100">
                        <span>{T.receiptPreview.driverPaidLine(selectedReceipt.data.driverName || T.receiptPreview.unknownDriver)}</span>
                        <span className="font-mono">{(selectedReceipt.data.driverPaid || 0).toLocaleString()} / {selectedReceipt.data.driverCost.toLocaleString()} {T.common.currency}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-300 pt-6 flex justify-between text-xs">
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">{T.receiptPreview.signDriver}</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">{T.receiptPreview.signClientStamp}</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                  <div className="text-center w-1/3">
                    <p className="font-bold mb-6 text-slate-700">{T.receiptPreview.signManager}</p>
                    <div className="h-0.5 bg-slate-300 w-24 mx-auto"></div>
                  </div>
                </div>

              </div>

              <div className="mt-4 flex justify-end gap-2.5 no-print">
                <button
                  onClick={() => setIsReceiptOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {T.receiptPreview.close}
                </button>
                <button
                  onClick={handlePrint}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold cursor-pointer"
                >
                  {T.receiptPreview.confirmPrint}
                </button>
              </div>

            </div>
          </div>
        )}

    </div>
  );
}
