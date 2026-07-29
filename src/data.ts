/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientTransportTrip, MaterialResaleTx, OtherExpense } from "./types";

// Seed data for Client Transport (Tab 1)
export const INITIAL_CLIENT_TRIPS: ClientTransportTrip[] = [
  {
    id: "TR-202",
    date: "2026-06-01",
    clientName: "مجموعة حداد للأشغال العامة",
    originFactory: "مصنع الإسمنت سيدي بلعباس",
    destination: "ورشة الطريق السريع تلمسان",
    materialType: "إسمنت رمادي 42.5",
    totalTonnage: 32.5,
    truckCost: 15000,
    driverCut: 5000,
    companyProfit: 6000,
    driverName: "بلال رحماني",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "TR-203",
    date: "2026-06-03",
    clientName: "شركة بوعمامة للبناء",
    originFactory: "محجرة الغرب تلموني",
    destination: "موقع 1500 مسكن عدل",
    materialType: "حصى غسيل 0/15",
    totalTonnage: 40.0,
    truckCost: 12000,
    driverCut: 4000,
    companyProfit: 4500,
    driverName: "عمر بوزيد",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "TR-204",
    date: "2026-06-05",
    clientName: "مؤسسة بلحول للري",
    originFactory: "مركب الحديد و الصلب وهران",
    destination: "قناة جر المياه سفيزف",
    materialType: "أنابيب حديد قطر 500",
    totalTonnage: 15.0,
    truckCost: 20000,
    driverCut: 6000,
    companyProfit: 8000,
    driverName: "بلال رحماني",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "TR-205",
    date: "2026-06-07",
    clientName: "الحاج بلخير للمقاولات",
    originFactory: "محجرة الرمال تيموشنت",
    destination: "منطقة النشاطات عين تموشنت",
    materialType: "رمل بناء ناعم",
    totalTonnage: 28.0,
    truckCost: 8000,
    driverCut: 3500,
    companyProfit: 3500,
    driverName: "حسين مقراني",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "TR-206",
    date: "2026-06-09",
    clientName: "مؤسسة الأشغال الكبرى العيد",
    originFactory: "مصنع الأجر السانية",
    destination: "حي السلام بلعباس",
    materialType: "أجر أحمر 8 عيون",
    totalTonnage: 30.0,
    truckCost: 14000,
    driverCut: 4500,
    companyProfit: 5500,
    driverName: "عمر بوزيد",
    clientPaid: 0,
    driverPaid: 0
  }
];

// Seed data for Material Resale (Tab 2)
export const INITIAL_RESALE_TXS: MaterialResaleTx[] = [
  {
    id: "RS-801",
    date: "2026-06-02",
    endClient: "المقاول الأخضر لتهيئة الحدائق",
    destination: "حديقة المسيلة الحضرية",
    factoryPurchasePrice: 1200, // dzd per ton
    totalTonnage: 45.0,
    clientSellingPrice: 115000, // Total selling combo to client
    truckCost: 16000,
    driverCost: 5000,
    explicitProfit: 7000,
    driverName: "بلال رحماني",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "RS-802",
    date: "2026-06-04",
    endClient: "شركة جيل المستقبل العقارية",
    destination: "مشروع سكني حي الأمل",
    factoryPurchasePrice: 2500, // dzd per ton
    totalTonnage: 50.0,
    clientSellingPrice: 220000, // Total selling combo
    truckCost: 22000,
    driverCost: 7000,
    explicitProfit: 11000,
    driverName: "حسين مقراني",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "RS-803",
    date: "2026-06-06",
    endClient: "مؤسسة الأشغال المائية التل",
    destination: "سد وادي التل",
    factoryPurchasePrice: 1800,
    totalTonnage: 35.0,
    clientSellingPrice: 145000,
    truckCost: 15000,
    driverCost: 4500,
    explicitProfit: 7500,
    driverName: "عمر بوزيد",
    clientPaid: 0,
    driverPaid: 0
  },
  {
    id: "RS-804",
    date: "2026-06-08",
    endClient: "تعاونية البناء بلعباس الأنيق",
    destination: "حي التعاونية بلعباس",
    factoryPurchasePrice: 1100,
    totalTonnage: 60.0,
    clientSellingPrice: 160000,
    truckCost: 18000,
    driverCost: 6000,
    explicitProfit: 8000,
    driverName: "بلال رحماني",
    clientPaid: 0,
    driverPaid: 0
  }
];

// Seed data for Other Expenses (Tab 3)
export const INITIAL_EXPENSES: OtherExpense[] = [
  {
    id: "EXP-101",
    date: "2026-06-02",
    category: "Fuel",
    truckPlate: "01345-116-22",
    amount: 18000,
    status: "Paid"
  },
  {
    id: "EXP-102",
    date: "2026-06-04",
    category: "Spare Parts",
    truckPlate: "44129-113-22",
    amount: 45000,
    status: "Paid"
  },
  {
    id: "EXP-103",
    date: "2026-06-06",
    category: "Fines",
    truckPlate: "01345-116-22",
    amount: 6000,
    status: "Pending"
  },
  {
    id: "EXP-104",
    date: "2026-06-07",
    category: "Salaries",
    truckPlate: "جميع الشاحنات",
    amount: 85000,
    status: "Paid"
  },
  {
    id: "EXP-105",
    date: "2026-06-08",
    category: "Admin",
    truckPlate: "مكتب الإدارة",
    amount: 12000,
    status: "Paid"
  },
  {
    id: "EXP-106",
    date: "2026-06-09",
    category: "Fuel",
    truckPlate: "09689-115-22",
    amount: 22000,
    status: "Paid"
  }
];

// Translations and helpers specifically for fleet transportation & expenses
export const TRANSLATE_EXPENSE_CATEGORY: Record<string, string> = {
  "Fuel": "وقود ومحروقات",
  "Spare Parts": "قطع غيار وميكانيك",
  "Fines": "غرامات ومخالفات الطرق",
  "Salaries": "رواتب ومكافآت",
  "Admin": "مصاريف إدارية ومكتبية"
};

export const EXPENSE_CATEGORIES = [
  { value: "Fuel", label: "وقود ومحروقات" },
  { value: "Spare Parts", label: "قطع غيار وميكانيك" },
  { value: "Fines", label: "غرامات ومخالفات الطرق" },
  { value: "Salaries", label: "رواتب ومكافآت" },
  { value: "Admin", label: "مصاريف إدارية ومكتبية" }
];
