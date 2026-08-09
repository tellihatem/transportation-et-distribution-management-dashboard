/**
 * ============================================================================
 *  نصوص الواجهة — ALL USER-VISIBLE TEXT
 * ============================================================================
 *
 *  FOR THE TRANSLATOR / REVIEWER
 *  -----------------------------
 *  Every word the user sees in the application lives in this one file.
 *  Nothing else needs to be opened or edited.
 *
 *  HOW TO EDIT
 *    - Change ONLY the text between the quotes "...".
 *    - Never change the names on the left of the colon (e.g. `companyName:`),
 *      and never remove a line — the app looks text up by those names.
 *    - Lines that look like `(n) => \`... ${n} ...\`` contain a value the app
 *      fills in at runtime. Keep the `${...}` part ly as it is; move it
 *      within the sentence if Arabic word order needs it.
 *    - Text is right-to-left Arabic. "دج" is the Algerian dinar currency mark.
 *
 *  Each section below matches one screen or area of the app, and the comments
 *  explain where the text appears so wording can match the actual feature.
 *
 *  ONE EXCEPTION
 *    The Windows installer's own screens (setup and uninstall prompts) are
 *    compiled by the installer tool, not bundled with the app, so their Arabic
 *    lives in `build/installer.nsh` instead. It is a handful of lines, and it
 *    is the only user-visible text outside this file.
 * ============================================================================
 */

export const T = {
  /* ────────────────────────────────────────────────────────────────────────
   *  عام — Shared words reused across many screens
   * ──────────────────────────────────────────────────────────────────────── */
  common: {
    /** Currency mark shown after every money amount (Algerian dinar). */
    currency: "دج",
    /** Default unit of quantity for a load. */
    defaultUnit: "طن",
    /** Placeholder shown where a value is missing. */
    emptyValue: "—",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  هوية الشركة — Company identity (header, invoices, statements)
   * ──────────────────────────────────────────────────────────────────────── */
  brand: {
    /** Company name — appears in the app header, invoices and statements. */
    companyName: "نقل وتوزيع البضائع لعلاوي عبد المالك",
    /** Small badge next to the company name in the header. */
    safeModeBadge: "وضع آمن",
    /** One-line description of what the app does, under the company name. */
    tagline: "مراقبة وتدقيق تكاليف الشحن، الأرباح ، ومصاريف الأسطول البري",
    /** Label above the owner's name in the header. */
    managerLabel: "المسؤول",
    /** The owner / person responsible. */
    managerName: "السيد لعلاوي عبد المالك",
    /** Owner name as signed at the bottom of printed documents. */
    signatureName: "لعلاوي عبد المالك",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  شاشة الدخول — Login screen (password gate, currently disabled)
   * ──────────────────────────────────────────────────────────────────────── */
  auth: {
    /** Shown while the app checks whether the session is still valid. */
    checkingSession: "جارٍ التحقق من الجلسة...",
    /** Instruction under the title on the login screen. */
    prompt: "أدخل كلمة المرور للدخول إلى لوحة التحكم",
    /** Placeholder inside the password box. */
    passwordPlaceholder: "كلمة المرور",
    /** Login button, normal state. */
    submit: "دخول",
    /** Login button while the request is in flight. */
    submitting: "جارٍ الدخول...",
    /** Error: the typed password was wrong. */
    wrongPassword: "كلمة المرور غير صحيحة",
    /** Error: no password has been configured on the server yet. */
    notConfigured: "لم يتم إعداد كلمة المرور على الخادم بعد.",
    /** Error: the server could not be reached at all. */
    connectionFailed: "تعذر الاتصال بالخادم. حاول مرة أخرى.",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تصنيفات المصاريف — Expense categories (dropdown + table labels)
   * ──────────────────────────────────────────────────────────────────────── */
  expenseCategory: {
    /** Fuel and oil for the trucks. */
    fuel: "وقود ومحروقات",
    /** Spare parts and mechanical repairs. */
    spareParts: "قطع غيار وميكانيك",
    /** Traffic fines and road penalties. */
    fines: "غرامات ومخالفات الطرق",
    /** Office and administrative costs. */
    admin: "مصاريف إدارية ومكتبية",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  لوحة القيادة الموحدة — Executive overview tab (the first/home screen)
   * ──────────────────────────────────────────────────────────────────────── */
  overview: {
    /** KPI card 1 title: total value of everything invoiced to clients. */
    invoicedTurnover: "رقم الأعمال المفوتر",
    /** Sub-line of card 1: cash actually received. */
    cashCollectedLabel: "المحصّل نقداً:",
    /** KPI card 2 title: the company's real net profit. */
    netProfit: "صافي أرباح الشركة الفعلي",
    /** Sub-line of card 2: net profit as a percentage. */
    netMarginLabel: "هامش الربح الصافي:",
    /** KPI card 3 title: money clients still owe the company. */
    clientReceivables: "مستحقات عند العملاء (ديون)",
    /** Sub-line of card 3: money clients paid in advance, not yet used. */
    clientAdvanceLabel: "ودائع مسبقة (عربون):",
    /** KPI card 4 title: wages the company still owes its drivers. */
    driverPayables: "مستحقات السائقين الواجبة",
    /** Sub-line of card 4: money advanced to drivers before settlement. */
    driverAdvancesLabel: "سلف السائقين:",

    /** Title above the main comparison bar chart. */
    chartTitle: "مقارنة المؤشرات المالية والسيولة النقدية (دج)",
    /** Word shown in the chart tooltip before the amount. */
    chartAmountLabel: "المبلغ",
    /** Bar labels in the comparison chart. */
    chartBars: {
      invoiced: "إجمالي الفواتير",
      collected: "المحصّل نقداً",
      clientDebts: "ديون العملاء",
      driverPayouts: "مدفوعات السائقين",
      operatingCosts: "مصاريف تشغيلية",
      netProfit: "صافي الربح الفعلي",
    },

    /** Title of the quick-links panel on the right. */
    quickLinksTitle: "الوصول السريع لمهام الإدارة",
    /** Explanation under the quick-links title. */
    quickLinksSubtitle: "الانتقال الفوري إلى التبويبات المتخصصة لإدارة العمليات والدفعات.",
    /** Quick link: go to the client accounts screen. */
    quickLinkClients: "تسجيل دفعات وتصفية حسابات العملاء",
    /** Quick link: go to the driver settlements screen. */
    quickLinkDrivers: "تسوية أجور ومستحقات السائقين",
    /** Quick links that show a record count in brackets. */
    quickLinkTrips: (count: number) => `سجل رحلات نقل العملاء (${count})`,
    quickLinkResales: (count: number) => `سجل عمليات بيع المواد (${count})`,
    quickLinkExpenses: (count: number) => `سجل المصاريف والمصاريف الأخرى (${count})`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  حسابات العملاء — Client accounts tab
   *  Tracks what each client was invoiced, what they paid, and what they owe.
   * ──────────────────────────────────────────────────────────────────────── */
  clientAccounts: {
    /* --- The four summary cards at the top --- */
    kpiInvoiced: "إجمالي الفواتير للعملاء",
    kpiInvoicedHint: "مجموع رحلات النقل وبيع المواد",
    kpiCollected: "إجمالي المبالغ المبلغ المقبوضة (المحصّل)",
    kpiCollectedHint: "السيولة النقدية المستلمة فعلياً",
    kpiOutstanding: "ديون العملاء المتبقية",
    kpiOutstandingHint: "مبالغ مستحقة على الرحلات غير المكتملة التسديد",
    kpiAdvance: "أرصدة ودائع مسبقة (عربون)",
    kpiAdvanceHint: "دفعت مسبقاً وغير مخصصة لرحلات بعد",

    /* --- Search box and the main action button --- */
    searchPlaceholder: "بحث باسم العميل...",
    recordPaymentButton: "تسجيل دفعة عميل جديدة (تجميعية / مسبقة)",

    /* --- Column headings of the client list --- */
    colName: "اسم العميل",
    colInvoiced: "إجمالي الفواتير",
    colCollected: "إجمالي المبالغ المبلغ المقبوضة",
    colOutstanding: "الرصيد المتبقي (دين)",
    colAdvance: "الرصيد المسبق (عربون)",
    colTripCount: "عدد الرحلات",
    colActions: "الإجراءات",

    /* --- States and per-row text in the client list --- */
    loading: "جارٍ تحميل حسابات العملاء...",
    empty: "لا توجد بيانات حسابات عملاء تطابق البحث.",
    /** Shown instead of an amount when a client owes nothing. */
    fullyPaid: "خالص بالكامل",
    /** Trip count cell, e.g. "٣ رحلة (١ غير مسددة)". */
    tripCountCell: (unpaid: number) => `رحلة (${unpaid} غير مسددة)`,
    /** Row buttons. */
    addPaymentAction: "إضافة دفعة",
    statementAction: "كشف حساب",

    /* --- "Record a payment" dialog --- */
    paymentModalTitle: "تسجيل دفعة جديدة للعميل",
    fieldReceiptNo: "رقم الوصل",
    fieldDate: "التاريخ",
    fieldClientName: "اسم العميل",
    /** NOTE: the English word "" is currently mixed into this Arabic
     *  placeholder — worth rewording. */
    fieldClientNamePlaceholder: "أدخل اسم العميل ",
    fieldAmount: "المبلغ المسدد (دج)",
    fieldPaymentMethod: "طريقة الدفع",
    methodCash: "نقداً",
    methodCheque: "صك بنكي",
    methodTransfer: "تحويل بنكي",
    /** How the money should be applied to outstanding trips. */
    allocationLabel: "طريقة تخصيص المبلغ على الرحلات",
    allocationAuto: "تلقائي (الأقدم فالأقدم)",
    allocationAutoHint: "تطبيق المبلغ تلقائياً على الرحلات القديمة غير المسددة أولاً",
    allocationNone: "إيداع كعربون / رصيد مسبق",
    allocationNoneHint: "الاحتفاظ بالمبلغ كرصيد مسبق للعميل لاستخدامه لاحقاً",
    fieldNotes: "ملاحظات / بيان الوصل",
    fieldNotesPlaceholder: "تفاصيل إضافية عن الدفعة...",
    cancel: "إلغاء",
    saving: "جاري التسجيل...",
    save: "حفظ الوصل وتطبيق الدفعة",
    /** Error alert if saving the payment fails. */
    saveError: (message: string) => `خطأ أثناء تسجيل الدفعة: ${message}`,

    /* --- "Statement of account" dialog (on screen) --- */
    statementTitle: "كشف حساب تفصيلي للعميل:",
    printButton: "طباعة الكشف",
    statementLoading: "جارٍ تحميل بيانات كشف الحساب...",
    statementEmpty: "لم يتم العثور على بيانات لهذا العميل.",
    stmtTotalInvoiced: "إجمالي قيمة الخدمات/المواد",
    stmtTotalPaid: "إجمالي المبالغ المسددة",
    stmtOutstanding: "الرصيد المتبقي (دين مستحق)",
    stmtAdvance: "الرصيد المسبق (عربون)",
    stmtTripsHeading: (count: number) => `سجل الرحلات والمعاملات المفوترة (${count})`,
    stmtColDate: "التاريخ",
    stmtColType: "نوع المعاملة",
    stmtColId: "رقم المعاملة",
    stmtColMaterialDest: "المادة / الوجهة",
    stmtColLoad: "الحمولة",
    stmtColTotalPrice: "السعر الكلي",
    stmtColPaid: "المسدد",
    stmtColRemaining: "المتبقي",
    /** The two kinds of transaction a client can be billed for. */
    typeTransport: "نقل عميل",
    typeResale: "بيع مواد",
    stmtPaymentsHeading: (count: number) => `سجل الدفعات والمبالغ المبلغ المقبوضة المسجلة (${count})`,
    stmtPayColReceipt: "رقم الوصل",
    stmtPayColDate: "التاريخ",
    stmtPayColMethod: "طريقة الدفع",
    stmtPayColAmount: "المبلغ",
    stmtPayColNotes: "ملاحظات",
    stmtNoPayments: "لا توجد دفعات مسجلة بعد.",

    /* --- The printed version of the statement (paper output) --- */
    printTitle: "كشف حساب تفصيلي",
    printClientLabel: "العميل:",
    printSummaryInvoiced: "إجمالي الفواتير",
    printSummaryPaid: "إجمالي المبالغ المسددة",
    printSummaryOutstanding: "الرصيد المتبقي (دين)",
    printSummaryAdvance: "الرصيد المسبق (عربون)",
    printTripsHeading: (count: number) => `سجل الرحلات والمعاملات (${count})`,
    printColType: "النوع",
    printColId: "الرقم",
    printTypeTransport: "نقل",
    printPaymentsHeading: (count: number) => `سجل الدفعات (${count})`,
    printNoPayments: "لا توجد دفعات مسجلة بعد",
    printSignClient: "توقيع العميل",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تسوية حسابات السائقين — Driver settlements tab
   *  Tracks what each driver earned, what they were paid, and what is owed.
   * ──────────────────────────────────────────────────────────────────────── */
  driverAccounts: {
    /* --- The four summary cards at the top --- */
    kpiEarned: "إجمالي أجور السائقين المستحقة",
    kpiEarnedHint: "مجموع أجور الرحلات المنفذة",
    kpiPaid: "إجمالي ما تم دفعه للسائقين",
    kpiPaidHint: "مبالغ التصفيات والسلف المسلمة فعلياً",
    kpiPayable: "مستحقات معلقة واجبة الدفع",
    kpiPayableHint: "أجور رحلات غير مسددة بعد",
    kpiAdvance: "إجمالي سلف السائقين",
    kpiAdvanceHint: "دفعت كسلفة قبل تصفية الرحلات",

    /* --- Search box and the main action button --- */
    searchPlaceholder: "بحث باسم السائق...",
    recordPayoutButton: "تسوية المستحقات / دفع دفعة لسائق",

    /* --- Column headings of the driver list --- */
    colName: "اسم السائق",
    colEarned: "إجمالي الأجور المستحقة",
    colPaid: "إجمالي المدفوع له",
    colPayable: "المستحق الحالي (دين الشركة)",
    colAdvance: "رصيد السلفة",
    colTripCount: "عدد الرحلات",
    colActions: "الإجراءات",

    /* --- States and per-row text in the driver list --- */
    loading: "جارٍ تحميل حسابات السائقين...",
    empty: "لا توجد بيانات حسابات سائقين تطابق البحث.",
    /** Shown instead of an amount when a driver is owed nothing. */
    fullySettled: "مصفى بالكامل",
    /** Advance-balance cell suffix, e.g. "+٥٠٠٠ دج سلفة". */
    advanceSuffix: "سلفة",
    /** Trip count cell, e.g. "٣ رحلة (١ غير مسددة)". */
    tripCountCell: (unsettled: number) => `رحلة (${unsettled} غير مسددة)`,
    /** Row buttons. */
    payoutAction: "تصفية / دفع",
    statementAction: "كشف حساب",

    /* --- "Pay a driver" dialog --- */
    payoutModalTitle: "تسوية المستحقات / دفع للسائق",
    fieldReceiptNo: "رقم الوصل",
    fieldDate: "التاريخ",
    fieldDriverName: "اسم السائق",
    fieldDriverNamePlaceholder: "أدخل اسم السائق",
    fieldAmount: "المبلغ المدفوع (دج)",
    fieldPayoutType: "نوع الدفعة",
    /** The kinds of payment a driver can receive. These values are also
     *  stored in the database, so changing them affects existing records. */
    payoutTypeSettlement: "تسوية الرحلات",
    payoutTypeAdvance: "سلفة",
    payoutTypeBonus: "مكافأة",
    /** How the money should be applied to unsettled trips. */
    allocationLabel: "طريقة تطبيق التصفية",
    allocationAuto: "تلقائي (تصفية أقدم الرحلات)",
    allocationAutoHint: "تطبيق الدفعة لتصفية أجور الرحلات القديمة أولاً",
    allocationNone: "تسجيل كسلفة مسبقة",
    allocationNoneHint: "تسجيل المبلغ كسلفة على السائق دون تسوية الرحلات سابقة",
    fieldNotes: "ملاحظات / تفاصيل",
    fieldNotesPlaceholder: "ملاحظات عن التصفية...",
    cancel: "إلغاء",
    saving: "جاري التسجيل...",
    save: "حفظ وتأكيد التصفية",
    /** Error alert if saving the payout fails. */
    saveError: (message: string) => `خطأ أثناء تسوية مستحقات السائق: ${message}`,

    /* --- "Statement of account" dialog (on screen) --- */
    statementTitle: "كشف حساب أجور ومستحقات السائق:",
    printButton: "طباعة الكشف",
    statementLoading: "جارٍ تحميل بيانات كشف حساب السائق...",
    statementEmpty: "لم يتم العثور على بيانات لهذا السائق.",
    stmtTotalEarned: "إجمالي الأجور المستحقة",
    stmtTotalPaid: "إجمالي المدفوع له فعلياً",
    stmtOutstanding: "المستحق المعلق (دين الشركة)",
    stmtAdvance: "رصيد السلفة المتبقي",
    stmtTripsHeading: (count: number) => `سجل الرحلات والأجور المكتسبة (${count})`,
    stmtColDate: "التاريخ",
    stmtColType: "نوع الرحلة",
    stmtColId: "رقم الرحلة",
    stmtColClientDest: "العميل / الوجهة",
    stmtColLoad: "الحمولة",
    stmtColEarned: "حق السائق (الأجر)",
    stmtColPaid: "المدفوع له",
    stmtColRemaining: "المتبقي له",
    /** The two kinds of job a driver can be paid for. */
    typeTransport: "نقل",
    typeResale: "توصيل مواد",
    stmtPayoutsHeading: (count: number) => `سجل التصفيات والسلف المسلمة للسائق (${count})`,
    stmtPayColReceipt: "رقم الوصل",
    stmtPayColDate: "التاريخ",
    stmtPayColType: "نوع الدفعة",
    stmtPayColAmount: "المبلغ",
    stmtPayColNotes: "ملاحظات",
    stmtNoPayouts: "لا توجد تصفيات أو سلف مسجلة بعد.",

    /* --- The printed version of the statement (paper output) --- */
    printTitle: "كشف حساب أجور ومستحقات السائق",
    printDriverLabel: "السائق:",
    printSummaryEarned: "إجمالي الأجور المستحقة",
    printSummaryPaid: "إجمالي المدفوع",
    printSummaryOutstanding: "المستحق المعلق",
    printSummaryAdvance: "رصيد السلفة",
    printTripsHeading: (count: number) => `سجل الرحلات والأجور (${count})`,
    printColType: "النوع",
    printColId: "الرقم",
    printColEarned: "الأجر",
    printColPaid: "المدفوع",
    printColRemaining: "المتبقي",
    printTypeResale: "توصيل",
    printPayoutsHeading: (count: number) => `سجل التصفيات والسلف (${count})`,
    printNoPayouts: "لا توجد تصفيات مسجلة بعد",
    printSignDriver: "توقيع السائق",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  مشترك بين المستندات المطبوعة — Shared wording on printed documents
   * ──────────────────────────────────────────────────────────────────────── */
  printCommon: {
    /** Date the document was printed. */
    printDateLabel: "تاريخ الطباعة:",
    /** Signature block for the owner, on every printed document. */
    approvedBy: "صادق عليها المسؤول",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  التقويم والوحدات — Month names and units of quantity
   * ──────────────────────────────────────────────────────────────────────── */
  calendar: {
    /** Month names in the Algerian (French-derived) convention, Jan → Dec.
     *  Order matters — do not reorder. */
    months: ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان",
      "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
  },
  units: {
    /** Suggested units offered in the quantity dropdown. The field is free
     *  text, so the operator can type anything else. */
    suggestions: ["طن", "قنطار", "كيلوغرام", "متر مكعب", "وحدة", "كيس", "لتر", "رحلة"],
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  شارات الدفع — Paid / outstanding badges in the trip and resale tables
   * ──────────────────────────────────────────────────────────────────────── */
  badge: {
    /** Green badge when nothing is owed any more. */
    fullyPaid: "مدفوع بالكامل",
    /** Amber badge showing how much is still due. */
    remaining: "متبقي:",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  الرسائل والتنبيهات — Confirmations, alerts and error messages
   * ──────────────────────────────────────────────────────────────────────── */
  dialogs: {
    /** Asked before permanently deleting a record. */
    confirmDelete: "هل أنت متأكد من رغبتك في حذف هذا السجل بشكل نهائي؟",
    deleteFailed: (message: string) => `تعذر حذف السجل: ${message}`,
    saveFailed: (message: string) => `تعذر حفظ السجل: ${message}`,
    /** Asked before restoring a backup, which wipes all current data. */
    confirmImport: "سيؤدي الاستيراد إلى استبدال جميع البيانات الحالية في قاعدة البيانات بالكامل بمحتوى الملف المحدد. هل تريد المتابعة؟",
    importSucceeded: (trips: number, resales: number, expenses: number) =>
      `تم الاستيراد بنجاح:\n${trips} رحلة نقل، ${resales} عملية إعادة بيع، ${expenses} مصروف.\nسيتم إعادة تحميل الصفحة الآن.`,
    importFailed: (message: string) => `فشل استيراد النسخة الاحتياطية: ${message}`,
    /** Filename prefix when printing a receipt (becomes e.g. "وصل-TR-12"). */
    receiptFilePrefix: "وصل",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تسميات الرسوم البيانية — Chart series names
   *  IMPORTANT: these double as data keys, so each must stay unique.
   * ──────────────────────────────────────────────────────────────────────── */
  charts: {
    /** Stacked bars: how one trip's fee splits up. */
    truckCost: "تكلفة الشاحنة",
    driverDue: "مستحقات السائق",
    companyMargin: "هامش الشركة",
    /** Resale comparison chart. */
    materialPurchaseCost: "تكلفة شراء المادة",
    finalSellingPrice: "سعر البيع النهائي",
    actualTotalProfit: "إجمالي الربح الفعلي",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  الشريط العلوي — App header
   * ──────────────────────────────────────────────────────────────────────── */
  header: {
    logoAlt: "شعار الشركة",
    exportBackup: "تصدير نسخة احتياطية",
    exportBackupTitle: "تصدير نسخة احتياطية من قاعدة البيانات",
    importBackup: "استيراد نسخة احتياطية",
    importBackupTitle: "استيراد نسخة احتياطية إلى قاعدة البيانات",
    /** Danger button: wipes every record in the database. */
    resetData: "تفريغ قاعدة البيانات",
    resetDataTitle: "حذف جميع السجلات نهائياً من قاعدة البيانات",
    /** Small badge showing which build of the app is running. The version
     *  number is added after this word by the app, so this is just the word. */
    versionLabel: "الإصدار",
    /** Tooltip on that badge: the exact build number and the database file
     *  currently in use. Shown on hover; \n starts a new line. */
    versionTitle: (build: string, dbFile: string) =>
      `رقم البناء: ${build}\nملف قاعدة البيانات: ${dbFile}`,
    /** Shown in the badge while the app is still asking the server. */
    versionLoading: "…",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تفريغ قاعدة البيانات — "Delete everything" dialog
   *  Used to clear leftover or trial data. The action cannot be undone, so
   *  the operator has to type a word to confirm.
   * ──────────────────────────────────────────────────────────────────────── */
  reset: {
    title: "تفريغ قاعدة البيانات نهائياً",
    /** Explains exactly what will be deleted. */
    body: "سيتم حذف كل الرحلات وعمليات البيع والمصاريف ودفعات العملاء والسائقين نهائياً. لا يمكن التراجع عن هذه العملية.",
    /** Advice to take a backup first. */
    backupHint: "ننصح بتصدير نسخة احتياطية قبل المتابعة.",
    /** Precedes the full path of the database file about to be emptied. */
    databaseFileLabel: "ملف قاعدة البيانات:",
    /** The operator must type this word to unlock the button. */
    confirmWord: "حذف",
    confirmPrompt: (word: string) => `اكتب كلمة «${word}» للتأكيد:`,
    cancel: "إلغاء",
    submit: "حذف جميع البيانات",
    working: "جاري الحذف...",
    /** Shown after a successful wipe; the app reloads straight after. */
    done: (total: number) => `تم حذف ${total} سجل. قاعدة البيانات فارغة الآن.`,
    failed: (message: string) => `تعذر تفريغ قاعدة البيانات: ${message}`,
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  لوحة المعادلة المالية — The profit formula panel at the top of every screen
   * ──────────────────────────────────────────────────────────────────────── */
  master: {
    periodBadge: "الملخص المالي الشامل للفترة المحددة",
    title: "معادلة صافي ربح الشركة",
    /** The three inputs and the result of the profit formula. */
    transportProfit: "أرباح رحلات نقل العملاء",
    resaleProfit: "أرباح بيع وتوصيل المواد",
    fleetExpenses: "مصاريف الأسطول المدفوعة",
    netProfit: "صافي ربح الشركة",
    /** The four cash-position boxes underneath the formula. */
    cashCollected: "المحصّل من العملاء",
    cashReceivable: "متبقي على العملاء",
    driverPaid: "المدفوع للسائقين",
    driverPayable: "متبقي للسائقين",
    /** The large profit figure on the right of the panel. */
    periodProfitTitle: "صافي ربح الشركة خلال الفترة",
    /** Reminder that the profit above is invoiced, not cash in hand. */
    accrualNote: "ربح محتسب على الفواتير، وليس نقداً في الخزينة",
    /** Health line: shown when profitable / when costs exceed margins. */
    healthy: "الموازنة في حالة كفاءة وربحية إيجابية",
    unhealthy: "المصاريف تتخطى هوامش الربح الحالية",
    /** Warning strip: how much is still uncollected from clients. */
    uncollectedSuffix: "لم تُحصّل بعد من العملاء",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  التصفية والتبويبات — Search / date filter bar and the tab buttons
   * ──────────────────────────────────────────────────────────────────────── */
  filters: {
    searchPlaceholder: "بحث سريع برقم السند، الجهة، أو اسِم العميل...",
    /** Sits between the "from" and "to" date boxes. */
    dateTo: "إلى",
    clear: "مسح التصفية",
    /** Tooltip on the clear button, e.g. "إعادة تعيين إلى أوت 2026". */
    resetTo: (month: string, year: number) => `إعادة تعيين إلى ${month} ${year}`,
  },
  tabs: {
    overview: "لوحة القيادة الموحدة",
    transport: "رحلات نقل العملاء",
    resale: "بيع وتوصيل المواد",
    clients: "حسابات العملاء",
    drivers: "تسوية حسابات السائقين",
    expenses: "مصاريف الأسطول الأُخرى",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تبويب رحلات النقل — Client transport trips tab
   * ──────────────────────────────────────────────────────────────────────── */
  transport: {
    kpiTripCount: "عدد الرحلات الجارية",
    kpiTripCountHint: "رحلة مرصودة للعملاء الفعليين",
    kpiRevenue: "إجمالي الإيرادات",
    kpiRevenueHint: "تكلفة الشحن الكلية المحتسبة للعميل",
    kpiDriverWages: "إجمالي أجور السائقين",
    kpiDriverWagesHint: "الأجور المستحقة عن الرحلات (مدفوعة وغير مدفوعة)",
    kpiNetMargin: "الربح الصافي للشركة",
    kpiNetMarginHint: "الهامش الباقي لخزانة المؤسسة",
    kpiClientOutstanding: "متبقي على العملاء",
    kpiClientOutstandingHint: "مبالغ لم يسددها العملاء بعد",
    kpiDriverOutstanding: "متبقي للسائقين",
    kpiDriverOutstandingHint: "مستحقات لم تُدفع للسائقين بعد",

    chartTitle: "توزيع التكلفة الصافي لكل رحلة",
    chartSubtitle: "أشرطة تظهر انقسام العوائد بين الشاحنة، السائق وهامش المؤسسة",
    chartEmpty: "لا توجد بيانات مخطط كافية للفلترة",
    legendTrucks: "شاحنات",
    legendDrivers: "سائقين",
    legendProfit: "أرباح الشركة",

    tableTitle: "تفاصيل الشحنات والمطالبات",
    addButton: "تسجيل رحلة عميل",
    colId: "رقم السند",
    colDate: "التاريخ",
    colClientMaterial: "العميل والمادة",
    colRouteDetails: "تفاصيل النقل",
    colQuantity: "الكمية",
    colTotalFee: "التعريفة الإجمالية",
    colClientPayments: "مدفوعات العميل",
    colDriverPayments: "السائق ومدفوعاته",
    colTools: "أدوات",
    empty: "لا توجد سجلات رحلات مطابقة للتصفية الحالية.",
    /** Route cell: "from X" / "to Y". */
    routeFrom: "من:",
    routeTo: "إلى:",
    /** Row action button that opens the printable receipt. */
    receiptButton: "وصل",
    receiptButtonTitle: "طباعة الوصل",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تبويب بيع وتوصيل المواد — Material resale tab
   * ──────────────────────────────────────────────────────────────────────── */
  resale: {
    kpiTurnover: "إجمالي مبيعات الزبائن",
    kpiTurnoverHint: "حجم تعاملات التوريد الكلي للمواد",
    kpiCapital: "رأس المال والمشتريات",
    kpiCapitalHint: "القيمة المستحقة للمصنع لشراء المواد",
    kpiVisibleTransport: "أجور النقل الظاهرة",
    kpiVisibleTransportHint: "رسوم النقل المقيدة على المعاملة",
    kpiTrueProfit: "إجمالي الربح الحقيقي",
    kpiTrueProfitHint: "يشمل الربح الخفي والهامش الظاهر",
    kpiClientOutstanding: "متبقي على العملاء",
    kpiClientOutstandingHint: "مبالغ لم يسددها الزبائن بعد",
    kpiDriverOutstanding: "متبقي للسائقين",
    kpiDriverOutstandingHint: "مستحقات لم تُدفع للسائقين بعد",

    chartTitle: "مقارنة كلفة شراء السلع بعوائد البيع",
    chartSubtitle: "يعكس بوضوح الكفاءة النقدية للشركة وإجمالي الربح الخفي",
    chartEmpty: "لا توجد بيانات كافية",
    legendPurchase: "كلفة الشراء",
    legendSales: "مبيعات التوريد",
    legendProfit: "عائد الأرباح الكلية",

    tableTitle: "إعادة بيع وتوريد السلع",
    addButton: "تسجيل صفقة تجارية",
    colId: "رقم العملية",
    colDate: "التاريخ",
    colEndClient: "الزبون النهائي",
    colPricing: "تفاصيل الأسعار",
    colHiddenMargin: "الهامش الخفي",
    colTrueProfit: "إجمالي الكسب الحقيقي",
    colClientPayments: "مدفوعات العميل",
    colDriverPayments: "السائق ومدفوعاته",
    colTools: "أدوات",
    empty: "لا توجد صفقات تجارية مسجلة.",
    /** Pricing cell: selling price vs. cost. */
    cellSelling: "البيع:",
    cellCost: "الكلفة:",
    cellDestination: "إلى:",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  تبويب مصاريف الأسطول — Fleet expenses tab
   * ──────────────────────────────────────────────────────────────────────── */
  expenses: {
    kpiCount: "سجلات المصاريف الكلية",
    kpiCountHint: "عمليّة صرف تشغيلية مسجلة",
    kpiTotal: "إجمالي المصاريف والوقود",
    kpiTotalHint: "المصاريف المدفوعة فقط (لا تشمل المعلقة)",
    kpiPending: "المصاريف المعلقة",
    kpiPendingHint: "قيد الدراسة ولم تُحتسب ضمن المصاريف",

    chartTitle: "تقسيم النفقات التشغيلية",
    chartSubtitle: "عرض مرئي للأعباء التي تم كبحها أو صرفها من الميزانية الكلية",
    chartEmpty: "لا توجد مصاريف مدفوعة للعرض",

    tableTitle: "جدول المصاريف والصيانات والأجور",
    addButton: "إدراج سند أعباء",
    colId: "معرف المصرف",
    colDate: "تاريخ القيد",
    colCategory: "الفئة والنوع",
    colPlate: "رقم لوحة المركبة",
    colAmount: "المبلغ المصروف",
    colStatus: "الحالة النقدية",
    colTools: "أدوات",
    empty: "لا توجد مصاريف مقيدة.",
    /** Status shown in the table. */
    statusPaid: "مدفوعة",
    statusPendingShort: "معلقة",
    /** Same two states as worded in the form dropdown. NOTE: the pending
     *  state is worded differently here than in the table above. */
    statusPendingLong: "قيد المراجعة",
    /** Used when no truck plate was entered. */
    unknownPlate: "غير محدد",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  نافذة الإضافة والتعديل — The add / edit record dialog
   * ──────────────────────────────────────────────────────────────────────── */
  form: {
    titleAdd: "إضافة قيد جديد",
    titleEdit: "تحديث وتعديل القيد",
    /** Which kind of record is being edited, shown next to the title. */
    kindTransport: "شحن عميل",
    kindResale: "تجارة وتوريد",
    kindExpense: "أعباء ومصاريف",
    cancel: "إلغاء الأمر",
    save: "حفظ وإدراج التعديل",

    /* --- Transport trip fields --- */
    tripId: "رقم سند النقل",
    date: "التاريخ",
    clientName: "اسم العميل بالكامل",
    clientNamePlaceholder: "مثال: شركة بوعمامة للبناء",
    driverName: "اسم السائق",
    tripDriverPlaceholder: "السائق المكلف بالرحلة",
    originFactory: "الالمصنع المورّد للمادة",
    originFactoryPlaceholder: "مصنع الأسمنت",
    destination: "الوجهة والمسار",
    destinationPlaceholder: "موقع 1500 مسكن",
    materialType: "نوع المادة المشحونة",
    materialPlaceholder: "حصى أو إسمنت",
    quantity: "الكمية الإجمالية",
    unitPlaceholder: "الوحدة",
    /** Cost breakdown box for a transport trip. */
    costBreakdownTitle: "تجزئة التكلفة والصافي",
    truckHire: "تأجير الشاحنة",
    driverWage: "أجرة السائق",
    companyProfit: "ربح الشركة الصافي",
    estimatedTotalFee: "إجمالي تعريفة النقل التقديرية للعميل:",

    /* --- Resale fields --- */
    resaleId: "رقم عملية التوريد",
    endClient: "العميل النهائي المستلم للسلعة",
    endClientPlaceholder: "عملاء الجملة",
    resaleDestination: "الوجهة (المكان الذي ستُنقل إليه السلعة)",
    resaleDestinationPlaceholder: "موقع التسليم النهائي",
    resaleDriverPlaceholder: "السائق المكلف بالتوصيل",
    resaleMaterial: "نوع المادة المباعة",
    factoryPurchasePrice: "سعر الشراء من الشركة الأصلية (للوحدة دج)",
    sourcingCostLabel: "تكلفة شراء البضاعة (الكمية × سعر الوحدة):",
    unitSellingPrice: "سعر البيع للزبون (للوحدة دج)",
    unitSellingPricePlaceholder: "سعر بيع الوحدة الواحدة",

    /* --- Goods section of the resale form --- */
    /** Heading of the section covering the goods themselves. */
    goodsSectionTitle: "حساب البضاعة",
    /** Purchase price per unit × quantity — what the goods cost us. */
    totalBuyCostLabel: "تكلفة الشراء الإجمالية:",
    /** Selling price per unit × quantity — what the client pays for goods. */
    totalSellRevenueLabel: "إجمالي البيع:",
    /** Sell revenue minus buy cost: what the goods alone earn. */
    grossProductProfitLabel: "مجمل ربح البضاعة:",

    /* --- Final profit summary (its own section, not inside transport) --- */
    profitSummaryTitle: "الملخص النهائي للربح",
    /** The amount billed to the client: goods + transport. Never typed in. */
    invoiceTotalLabel: "إجمالي الفاتورة للزبون:",
    /** Logistics cost box for a resale. */
    logisticsTitle: "تحليل تحليل التكلفة اللوجستية",
    resaleDriverCost: "كلفة السائق",
    explicitMargin: "الهامش البارز",
    hiddenMarginLabel: "قيمة الربح الخفي:",
    trueProfitLabel: "إجمالي صافي الربح الحقيقي:",
    /** Trips box. Every delivery is at least one trip; the box above gives
     *  the cost of ONE trip, and this multiplies it. */
    multiTripTitle: "عدد الرحلات",
    tripCount: "عدد الرحلات (1 على الأقل)",
    /** Not typed in — calculated from كراء الشاحنة + كلفة السائق + الهامش البارز. */
    tripUnitCost: "سعر الرحلة الواحدة (محتسب)",
    multiTripTotal: "إجمالي تكلفة النقل:",
    /** The per-trip price that will be printed on the client's invoice. */
    clientPerTripLabel: "سعر الرحلة للزبون (يظهر في الفاتورة):",
    /** Shown instead of a price when the total does not divide evenly. No
     *  rounded figure is displayed, and none is printed on the invoice. */
    perTripNotExact: "لا ينقسم بالتساوي — لن يظهر سعر الرحلة في الفاتورة",

    /* --- Expense fields --- */
    expenseId: "رقم الفاتورة / المصرف",
    expenseCategory: "تصنيف النفقات الرئيسي",
    truckPlate: "رقم لوحة الشاحنة المستهدفة",
    truckPlatePlaceholder: "مثال: 01345-116-22",
    expenseAmount: "المبلغ المالي المصروف (دج)",
    expenseStatus: "الحالة النقدية والوفر",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  الفاتورة المطبوعة — The invoice that is sent to the printer
   *  This is the document the client receives, so wording matters most here.
   * ──────────────────────────────────────────────────────────────────────── */
  facture: {
    subtitle: "فاتورة رسمية",
    systemDateLabel: "التاريخ الحالي للنظام:",
    transportDateLabel: "تاريخ النقل:",
    /** Who the invoice is addressed to — wording differs by record type. */
    clientLabel: "اسم العميل:",
    endClientLabel: "الزبون النهائي:",
    quantityLabel: "الكمية الإجمالية:",
    materialLabel: "المادة المشحونة:",
    originLabel: "منشأ الشحنة:",
    destinationLabel: "الوجهة المستهدفة:",
    driverLabel: "السائق:",
    /** Price lines on a resale invoice: goods, then delivery, then total. */
    goodsPriceLabel: (qty: number, unit: string, unitPrice: string) =>
      `ثمن البضاعة (${qty} ${unit} × ${unitPrice} دج)`,
    deliveryPriceLabel: "سعر النقل والتوصيل",
    /** Same delivery line when the job took more than one trip, showing what
     *  the client pays for each trip. That figure is this line's total divided
     *  by the number of trips — it is the client's price per trip, not the
     *  company's cost, so the margin stays private and the two numbers always
     *  multiply back to the total shown. */
    deliveryPriceMultiTrip: (trips: number, perTrip: string) =>
      `سعر النقل والتوصيل (${trips} رحلات × ${perTrip} دج)`,
    /** Used when the total does not divide into a whole price per trip. No
     *  per-trip figure is printed, because there is no exact one and money is
     *  never rounded on an invoice — only the number of trips is stated. */
    deliveryPriceTripsOnly: (trips: number) => `سعر النقل والتوصيل (${trips} رحلات)`,
    /** Title of the delivery line on a resale invoice; the line beneath it
     *  reads "<trips> رحلة × <price per trip>". */
    transportLineTitle: "خدمات النقل والتوصيل",
    /** Unit word after the number of trips on that line. */
    tripsUnit: "رحلة",
    /** Used as the goods line title when no material type was recorded. */
    goodsLineFallback: "البضاعة",
    /** Single price line on a plain transport invoice. */
    transportPriceLabel: "سعر النقل",
    grandTotalLabel: "المبلغ الإجمالي الواجب دفعه",
    paidLabel: "المدفوع",
    remainingLabel: "المتبقي",
    /** Signature blocks at the bottom of the invoice. */
    signDriverAndManager: "توقيع السائق والمسؤول",
    signClientStamp: "إمضاء وختم العميل",
    /** Small print at the very bottom. */
    footerNote: "وصل شحن داخلي معتمد للنظام",
  },

  /* ────────────────────────────────────────────────────────────────────────
   *  معاينة الوصل — On-screen receipt preview (internal, shows cost breakdown)
   *  This view is for the office, NOT for the client: it reveals costs and
   *  the hidden margin.
   * ──────────────────────────────────────────────────────────────────────── */
  receiptPreview: {
    header: "معاينة وتأكيد الفاتورة المعتمدة محلياً",
    printButton: "طباعة الوصل",
    close: "إغلاق المعاينة",
    confirmPrint: "تأكيد وطباعة السند الحالي",
    docSubtitle: "وصل شحن داخلي رسمي",

    /* --- Transport breakdown --- */
    costSheetTitle: "تفاصيل تكلفة الشحن",
    currencyNote: "العملة: الدينار الجزائري",
    truckHire: "صرف تأجير المركبة:",
    driverWage: "أجرة السائق:",
    companyProfit: "أرباح المؤسسة الصافية:",
    invoiceTotal: "مجموع الفاتورة الكلي:",
    clientPaid: "المدفوع من العميل:",
    clientRemaining: "المتبقي على العميل:",

    /* --- Resale breakdown --- */
    soldMaterialLabel: "المادة المباعة:",
    factoryPriceLabel: "سعر شراء المصنع:",
    goodsTotalCostLabel: "كلفة السلع الكلية:",
    pricingAnalysisTitle: "تحليل التسعير والتحليل اللوجستي",
    recordNoLabel: "رقم:",
    truckHireLong: "تأجير الشاحنة البرية:",
    tripCountLabel: "عدد الرحلات:",
    explicitTransportMargin: "هامش النقل الصريح:",
    hiddenProfit: "الأرباح الخفية من التسعير:",
    finalSellingTotal: "سعر البيع النهائي الإجمالي:",
    buyerPaid: "المدفوع من الزبون:",
    buyerRemaining: "المتبقي على الزبون:",
    /** Driver payment line, e.g. "السائق (أحمد) — المدفوع له:". */
    driverPaidLine: (driverName: string) => `السائق (${driverName}) — المدفوع له:`,
    /** Used when no driver name was recorded. */
    unknownDriver: "غير محدد",

    /* --- Signature blocks --- */
    signDriver: "توقيع السائق",
    signClientStamp: "إمضاء وختم العميل",
    signManager: "اعتماد المسؤول",
  },
} as const;

export default T;