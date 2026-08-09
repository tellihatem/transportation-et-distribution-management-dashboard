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
  quantityUnit: string;  // Unit the quantity is measured in (طن، وحدة، متر مكعب…)
  truckCost: number;     // Cost paid to truck owner
  driverCut: number;     // Cost paid to driver
  companyProfit: number; // Profit kept by company
  driverName: string;    // Which driver did the trip
  // Read-only: recomputed server-side from the payment ledgers. Never sent by forms.
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
  materialType: string; // What is being shipped
  originFactory: string; // Where the materials come from
  factoryPurchasePrice: number; // Purchase price per unit
  totalTonnage: number;
  quantityUnit: string;  // Unit the quantity is measured in (طن، وحدة، متر مكعب…)
  clientSellingPrice: number; // Total combo price sold to customer (Material + Delivery)
  truckCost: number;     // Truck logistics cost
  driverCost: number;    // Driver payment
  explicitProfit: number; // Declared profit for transport
  driverName: string;    // Which driver did the delivery
  // How many truck trips the delivery took. Always at least 1. truckCost,
  // driverCost and explicitProfit are all PER TRIP, so this multiplies them.
  tripCount: number;
  // Read-only: recomputed server-side from the payment ledgers. Never sent by forms.
  clientPaid: number;    // Amount the client has paid so far (toward clientSellingPrice)
  driverPaid: number;    // Amount paid to the driver so far (toward driverCost)
  // Computed fields:
  // - Sourcing Cost = factoryPurchasePrice * totalTonnage
  // - Visible Transport Fee = truckCost + driverCost + explicitProfit
  // - Hidden Margin Fee = clientSellingPrice - (Sourcing Cost + Visible Transport Fee)
  // - Total True Profit = explicitProfit + Hidden Margin Fee
}

/**
 * Payloads the trip/resale forms are allowed to send.
 *
 * clientPaid / driverPaid are deliberately excluded: they are a cache derived
 * from the payment ledgers (client_payment_allocations / driver_payment_allocations)
 * and are recomputed server-side whenever a payment is recorded or deleted.
 * Letting a form submit them would silently wipe recorded payments on edit.
 */
export type ClientTransportTripInput = Omit<ClientTransportTrip, 'clientPaid' | 'driverPaid'>;
export type MaterialResaleTxInput = Omit<MaterialResaleTx, 'clientPaid' | 'driverPaid'>;

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

// Client Payment Allocation & Record
export interface ClientPaymentAllocation {
  id?: number;
  paymentId?: string;
  tripType: 'transport' | 'resale';
  tripId: string;
  amount: number;
}

export interface ClientPayment {
  id: string;
  date: string;
  clientName: string;
  amount: number;
  paymentMethod: string;
  notes: string;
  allocatedAmount?: number;
  unallocatedAmount?: number;
  allocations?: ClientPaymentAllocation[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientSummary {
  clientName: string;
  totalInvoiced: number;
  totalPaymentsReceived: number;
  totalAllocatedPaid: number;
  outstandingReceivable: number;
  unallocatedCredit: number;
  totalTripsCount: number;
  unpaidTripsCount: number;
}

export interface ClientStatement {
  clientName: string;
  summary: {
    totalInvoiced: number;
    totalPaymentsReceived: number;
    totalAllocatedPaid: number;
    outstandingReceivable: number;
    unallocatedCredit: number;
  };
  itemizedTrips: Array<{
    type: 'transport' | 'resale';
    id: string;
    date: string;
    destination: string;
    materialType: string;
    totalTonnage: number;
    quantityUnit: string;
    totalPrice: number;
    clientPaid: number;
    remaining: number;
  }>;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    paymentMethod: string;
    notes: string;
  }>;
}

// Driver Payment Allocation & Record
export interface DriverPaymentAllocation {
  id?: number;
  paymentId?: string;
  tripType: 'transport' | 'resale';
  tripId: string;
  amount: number;
}

export interface DriverPayment {
  id: string;
  date: string;
  driverName: string;
  amount: number;
  paymentType: 'Settlement' | 'Advance' | 'Bonus' | string;
  notes: string;
  allocatedAmount?: number;
  unallocatedAmount?: number;
  allocations?: DriverPaymentAllocation[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DriverSummary {
  driverName: string;
  totalEarned: number;
  totalPaymentsGiven: number;
  totalAllocatedPaid: number;
  outstandingPayable: number;
  advanceBalance: number;
  totalTripsCount: number;
  unpaidTripsCount: number;
}

export interface DriverStatement {
  driverName: string;
  summary: {
    totalEarned: number;
    totalPaymentsGiven: number;
    totalAllocatedPaid: number;
    outstandingPayable: number;
    advanceBalance: number;
  };
  itemizedTrips: Array<{
    type: 'transport' | 'resale';
    id: string;
    date: string;
    clientName: string;
    destination: string;
    materialType: string;
    totalTonnage: number;
    quantityUnit: string;
    driverEarned: number;
    driverPaid: number;
    remaining: number;
  }>;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    paymentType: string;
    notes: string;
  }>;
}

