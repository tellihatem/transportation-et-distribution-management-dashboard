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
  factoryPurchasePrice: number; // Purchase price per unit (what we pay)
  productUnitPrice: number;     // Selling price per unit (what the client pays)
  totalTonnage: number;
  quantityUnit: string;  // Unit the quantity is measured in (طن، وحدة، متر مكعب…)
  // Invoice total billed to the client. DERIVED, not typed:
  //   productUnitPrice × totalTonnage  +  tripCount × (truckCost + driverCost + explicitProfit)
  // Kept as a stored field because the payment ledgers settle against it.
  clientSellingPrice: number;
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
  // Computed fields (see src/resale-math.ts — one implementation, shared):
  // - Total Buy Cost       = factoryPurchasePrice * totalTonnage
  // - Total Sell Revenue   = productUnitPrice     * totalTonnage
  // - Gross Product Profit = Total Sell Revenue - Total Buy Cost
  // - Cost Per Trip        = truckCost + driverCost + explicitProfit
  // - Transport Total      = tripCount * Cost Per Trip
  // - Hidden Profit        = Gross Product Profit - Transport Total
  // - Net Real Profit      = Hidden Profit + tripCount * explicitProfit
  // - Invoice Total        = Total Sell Revenue + Transport Total
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

/**
 * clientSellingPrice is excluded as well: the invoice total is computed
 * server-side from the goods and transport figures, so a form can no longer
 * submit a total that disagrees with the lines printed on the invoice.
 */
export type MaterialResaleTxInput = Omit<
  MaterialResaleTx,
  'clientPaid' | 'driverPaid' | 'clientSellingPrice'
>;

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
    /** Portion already applied to trips/shipments (0 = pure advance). */
    allocatedAmount: number;
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
    /** Portion already applied to trips/shipments (0 = pure advance). */
    allocatedAmount: number;
  }>;
}

// Supplier/Factory Ledger — debts arise from resales bought from the supplier
// (matched on originFactory) plus manual invoices; payments net against the
// combined total. Mirrors the driver ledger shapes.
export interface SupplierPaymentAllocation {
  id?: number;
  paymentId?: string;
  targetType: 'resale' | 'invoice';
  targetId: string;
  amount: number;
}

export interface SupplierPayment {
  id: string;
  date: string;
  supplierName: string;
  amount: number;
  paymentType: string; // label from strings: prepayment / debt repayment
  notes: string;
  allocatedAmount?: number;
  unallocatedAmount?: number;
  allocations?: SupplierPaymentAllocation[];
  createdAt?: string;
  updatedAt?: string;
}

/** A manual debt: goods received from a supplier outside any resale record. */
export interface SupplierInvoice {
  id: string;
  date: string;
  supplierName: string;
  amount: number;
  notes: string;
  paid: number;
  remaining: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierSummary {
  supplierName: string;
  totalOwed: number;
  totalPaymentsGiven: number;
  totalAllocatedPaid: number;
  outstandingDebt: number;   // max(0, owed − paid): net semantics
  prepaidBalance: number;    // max(0, paid − owed)
  shipmentsCount: number;
  unpaidCount: number;
}

export interface SupplierStatement {
  supplierName: string;
  summary: {
    totalOwed: number;
    totalPaymentsGiven: number;
    totalAllocatedPaid: number;
    outstandingDebt: number;
    prepaidBalance: number;
  };
  itemized: Array<{
    type: 'resale' | 'invoice';
    id: string;
    date: string;
    description: string;
    endClient: string;
    totalTonnage: number;
    quantityUnit: string;
    owed: number;
    paid: number;
    remaining: number;
  }>;
  payments: Array<{
    id: string;
    date: string;
    amount: number;
    paymentType: string;
    notes: string;
    /** Portion already applied to trips/shipments (0 = pure advance). */
    allocatedAmount: number;
  }>;
}

