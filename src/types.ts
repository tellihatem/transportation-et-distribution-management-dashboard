/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Tab 1: Client Transport Trip Record
export interface ClientTransportTrip {
  id: string; // Trip ID
  date: string; // YYYY-MM-DD
  clientName: string;
  originFactory: string;
  destination: string;
  materialType: string;
  totalTonnage: number;
  truckCost: number;     // Cost paid to truck owner
  driverCut: number;     // Cost paid to driver
  companyProfit: number; // Profit kept by company
  driverName: string;    // Which driver did the trip
  clientPaid: number;    // Amount the client has paid so far (toward the total fee)
  driverPaid: number;    // Amount paid to the driver so far (toward driverCut)
  // Computed field: Total Transport Fee = truckCost + driverCut + companyProfit
}

// Tab 2: Material Resale Transaction Record
export interface MaterialResaleTx {
  id: string; // Transaction ID
  date: string; // YYYY-MM-DD
  endClient: string;
  destination: string; // Delivery location for the resold materials
  factoryPurchasePrice: number; // Purchase price per ton
  totalTonnage: number;
  clientSellingPrice: number; // Total combo price sold to customer (Material + Delivery)
  truckCost: number;     // Truck logistics cost
  driverCost: number;    // Driver payment
  explicitProfit: number; // Declared profit for transport
  driverName: string;    // Which driver did the delivery
  clientPaid: number;    // Amount the client has paid so far (toward clientSellingPrice)
  driverPaid: number;    // Amount paid to the driver so far (toward driverCost)
  // Computed fields:
  // - Sourcing Cost = factoryPurchasePrice * totalTonnage
  // - Visible Transport Fee = truckCost + driverCost + explicitProfit
  // - Hidden Margin Fee = clientSellingPrice - (Sourcing Cost + Visible Transport Fee)
  // - Total True Profit = explicitProfit + Hidden Margin Fee
}

// Tab 3: Other Expense Record
export interface OtherExpense {
  id: string; // Expense ID
  date: string; // YYYY-MM-DD
  category: 'Fuel' | 'Spare Parts' | 'Fines' | 'Salaries' | 'Admin' | string;
  truckPlate: string;
  amount: number;
  status: 'Paid' | 'Pending';
}

// Active Filter state for unified search or tab-specific filters
export interface TabFilters {
  searchQuery: string;
  dateStart: string;
  dateEnd: string;
}
