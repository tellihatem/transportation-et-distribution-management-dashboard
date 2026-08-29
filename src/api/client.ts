/**
 * API Client — Centralized HTTP client for the Express backend
 * All data operations go through this module.
 */

import type { ClientTransportTrip, ClientTransportTripInput, MaterialResaleTx, MaterialResaleTxInput, OtherExpense } from '../types';

const BASE_URL = '/api';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message: string; code: string };
}

/**
 * Generic fetch wrapper with error handling.
 *
 * Every request carries a hard timeout. Without one, a stalled server let
 * requests pile up unboundedly behind the browser's per-host connection
 * limit — the backlog only a full reload could clear. A caller may pass its
 * own AbortSignal (the list hooks do, to cancel superseded searches); it is
 * combined with the timeout so either can end the request.
 */
const REQUEST_TIMEOUT_MS = 20000;

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
    signal,
  });

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || !json.success) {
    const message = json.error?.message || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return json.data;
}

// ──────────────────────────────────────────
// Build identity / diagnostics
// ──────────────────────────────────────────

export interface AppInfo {
  appVersion: string;
  buildId: string;
  buildTime: string | null;
  gitCommit: string | null;
  databaseFile: string;
  recordCounts: Record<string, number>;
}

/**
 * Which build is running and which database file it opened.
 *
 * Uses its own fetch rather than request<T>(): /api/health answers with a flat
 * object, not the { success, data } envelope request() unwraps, so going
 * through it would return undefined.
 */
export async function fetchAppInfo(): Promise<AppInfo> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// ──────────────────────────────────────────
// Client Transport Trips
// ──────────────────────────────────────────

export async function fetchTrips(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}, signal?: AbortSignal): Promise<ClientTransportTrip[]> {
  const query = buildQueryString(params);
  return request<ClientTransportTrip[]>(`/trips${query}`, { signal });
}

export async function fetchTripStats(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<{ grossRevenue: number; driverPayout: number; netMargin: number; totalTons: number }> {
  const query = buildQueryString(params);
  return request(`/trips/stats${query}`);
}

export async function fetchNextTripId(): Promise<string> {
  const data = await request<{ nextId: string }>('/trips/next-id');
  return data.nextId;
}

export async function createTrip(trip: ClientTransportTripInput): Promise<ClientTransportTrip> {
  return request<ClientTransportTrip>('/trips', {
    method: 'POST',
    body: JSON.stringify(trip),
  });
}

export async function updateTrip(id: string, trip: Partial<ClientTransportTripInput>): Promise<ClientTransportTrip> {
  return request<ClientTransportTrip>(`/trips/${id}`, {
    method: 'PUT',
    body: JSON.stringify(trip),
  });
}

/** One trip by id — used to open the edit form from a statement, where the
 *  loaded list may be filtered to a different date range. */
export async function fetchTripById(id: string): Promise<ClientTransportTrip> {
  return request<ClientTransportTrip>(`/trips/${id}`);
}

export async function deleteTrip(id: string): Promise<void> {
  return request(`/trips/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Material Resale Transactions
// ──────────────────────────────────────────

export async function fetchResales(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}, signal?: AbortSignal): Promise<MaterialResaleTx[]> {
  const query = buildQueryString(params);
  return request<MaterialResaleTx[]>(`/resales${query}`, { signal });
}

export async function fetchResaleStats(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<{ tradingTurnover: number; capitalOutlay: number; totalTrueProfit: number; totalTons: number }> {
  const query = buildQueryString(params);
  return request(`/resales/stats${query}`);
}

export async function fetchNextResaleId(): Promise<string> {
  const data = await request<{ nextId: string }>('/resales/next-id');
  return data.nextId;
}

export async function createResale(resale: MaterialResaleTxInput): Promise<MaterialResaleTx> {
  return request<MaterialResaleTx>('/resales', {
    method: 'POST',
    body: JSON.stringify(resale),
  });
}

export async function updateResale(id: string, resale: Partial<MaterialResaleTxInput>): Promise<MaterialResaleTx> {
  return request<MaterialResaleTx>(`/resales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(resale),
  });
}

/** One resale by id — see fetchTripById. */
export async function fetchResaleById(id: string): Promise<MaterialResaleTx> {
  return request<MaterialResaleTx>(`/resales/${id}`);
}

export async function deleteResale(id: string): Promise<void> {
  return request(`/resales/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Other Expenses
// ──────────────────────────────────────────

export async function fetchExpenses(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}, signal?: AbortSignal): Promise<OtherExpense[]> {
  const query = buildQueryString(params);
  return request<OtherExpense[]>(`/expenses${query}`, { signal });
}

export async function fetchExpenseStats(params?: {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<{ totalOverhead: number; categoryBreakdown: Record<string, number>; pendingAmount: number }> {
  const query = buildQueryString(params);
  return request(`/expenses/stats${query}`);
}

export async function fetchNextExpenseId(): Promise<string> {
  const data = await request<{ nextId: string }>('/expenses/next-id');
  return data.nextId;
}

export async function createExpense(expense: OtherExpense): Promise<OtherExpense> {
  return request<OtherExpense>('/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  });
}

export async function updateExpense(id: string, expense: Partial<OtherExpense>): Promise<OtherExpense> {
  return request<OtherExpense>(`/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(expense),
  });
}

export async function deleteExpenseApi(id: string): Promise<void> {
  return request(`/expenses/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Sync Status
// ──────────────────────────────────────────

export interface SyncStatusData {
  supabaseConfigured: boolean;
  supabaseReachable: boolean;
  pendingQueueItems: number;
  unsyncedRecords: number;
  breakdown: {
    trips: number;
    resales: number;
    expenses: number;
  };
}

export async function fetchSyncStatus(): Promise<SyncStatusData> {
  return request<SyncStatusData>('/sync/status');
}

export async function pushSync(): Promise<{ total: number; synced: number; failed: number }> {
  return request('/sync/push', { method: 'POST' });
}

export async function restoreFromCloud(): Promise<{
  success: boolean;
  tables: { client_trips: number; material_resales: number; expenses: number };
  totalRecords: number;
}> {
  return request('/sync/restore', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

// ──────────────────────────────────────────
// Backup / Restore (local file-based)
// ──────────────────────────────────────────

/**
 * Triggers a browser download of a full JSON backup of the local database.
 */
export function downloadBackup(): void {
  const a = document.createElement('a');
  a.href = `${BASE_URL}/backup/export`;
  a.click();
}

/**
 * Restores the local database from a previously exported backup file.
 * REPLACES all existing records — the caller should confirm with the user first.
 */
export async function importBackup(backup: any): Promise<{ imported: Record<string, number> }> {
  return request('/backup/import', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, tables: backup?.tables }),
  });
}

/**
 * Permanently deletes every business record, leaving an empty database.
 * Irreversible — the caller must confirm with the user first.
 */
export async function resetAllData(): Promise<{ deleted: Record<string, number>; total: number }> {
  return request('/backup/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

// ──────────────────────────────────────────
// Client Payments & Ledgers
// ──────────────────────────────────────────

export async function fetchClientPayments(params?: {
  clientName?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<import('../types').ClientPayment[]> {
  const query = buildQueryString(params);
  return request<import('../types').ClientPayment[]>(`/client-payments${query}`);
}

export async function fetchClientSummaries(): Promise<import('../types').ClientSummary[]> {
  return request<import('../types').ClientSummary[]>('/client-payments/summary');
}

export async function fetchClientStatement(clientName: string): Promise<import('../types').ClientStatement> {
  return request<import('../types').ClientStatement>(`/client-payments/statement/${encodeURIComponent(clientName)}`);
}

export async function fetchNextClientPaymentId(): Promise<string> {
  const data = await request<{ nextId: string }>('/client-payments/next-id');
  return data.nextId;
}

export async function createClientPayment(payload: {
  id?: string;
  date: string;
  clientName: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  allocationMode: 'auto' | 'manual' | 'none';
  allocations?: import('../types').ClientPaymentAllocation[];
}): Promise<import('../types').ClientPayment> {
  return request<import('../types').ClientPayment>('/client-payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Correct a client receipt entered wrongly. The server re-spreads the
 * corrected amount, so the per-trip figures follow the correction.
 */
export async function updateClientPayment(id: string, payload: {
  date: string;
  clientName: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  allocationMode: 'auto' | 'none';
}): Promise<import('../types').ClientPayment> {
  return request<import('../types').ClientPayment>(`/client-payments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteClientPayment(id: string): Promise<void> {
  return request(`/client-payments/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Driver Payments & Ledgers
// ──────────────────────────────────────────

export async function fetchDriverPayments(params?: {
  driverName?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<import('../types').DriverPayment[]> {
  const query = buildQueryString(params);
  return request<import('../types').DriverPayment[]>(`/driver-payments${query}`);
}

export async function fetchDriverSummaries(): Promise<import('../types').DriverSummary[]> {
  return request<import('../types').DriverSummary[]>('/driver-payments/summary');
}

export async function fetchDriverStatement(driverName: string): Promise<import('../types').DriverStatement> {
  return request<import('../types').DriverStatement>(`/driver-payments/statement/${encodeURIComponent(driverName)}`);
}

export async function fetchNextDriverPaymentId(): Promise<string> {
  const data = await request<{ nextId: string }>('/driver-payments/next-id');
  return data.nextId;
}

export async function createDriverPayment(payload: {
  id?: string;
  date: string;
  driverName: string;
  amount: number;
  paymentType?: string;
  notes?: string;
  allocationMode: 'auto' | 'manual' | 'none';
  allocations?: import('../types').DriverPaymentAllocation[];
}): Promise<import('../types').DriverPayment> {
  return request<import('../types').DriverPayment>('/driver-payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Correct a driver payment that was entered wrongly. The server re-spreads
 * the corrected amount across the driver's trips, so the trip-level figures
 * follow the correction automatically.
 */
export async function updateDriverPayment(id: string, payload: {
  date: string;
  driverName: string;
  amount: number;
  paymentType?: string;
  notes?: string;
  allocationMode: 'auto' | 'none';
}): Promise<import('../types').DriverPayment> {
  return request<import('../types').DriverPayment>(`/driver-payments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteDriverPayment(id: string): Promise<void> {
  return request(`/driver-payments/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Supplier/Factory Ledger
// ──────────────────────────────────────────

export async function fetchSupplierPayments(params?: {
  supplierName?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<import('../types').SupplierPayment[]> {
  const query = buildQueryString(params);
  return request<import('../types').SupplierPayment[]>(`/supplier-payments${query}`);
}

export async function fetchSupplierSummaries(): Promise<import('../types').SupplierSummary[]> {
  return request<import('../types').SupplierSummary[]>('/supplier-payments/summary');
}

export async function fetchSupplierStatement(supplierName: string): Promise<import('../types').SupplierStatement> {
  return request<import('../types').SupplierStatement>(`/supplier-payments/statement/${encodeURIComponent(supplierName)}`);
}

export async function fetchNextSupplierPaymentId(): Promise<string> {
  const data = await request<{ nextId: string }>('/supplier-payments/next-id');
  return data.nextId;
}

export async function createSupplierPayment(payload: {
  id?: string;
  date: string;
  supplierName: string;
  amount: number;
  paymentType?: string;
  notes?: string;
  allocationMode: 'auto' | 'none';
}): Promise<import('../types').SupplierPayment> {
  return request<import('../types').SupplierPayment>('/supplier-payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Correct a supplier payment entered wrongly. Any manual deductions drawn
 * from it are undone, since they spent money the corrected figure may no
 * longer contain.
 */
export async function updateSupplierPayment(id: string, payload: {
  date: string;
  supplierName: string;
  amount: number;
  paymentType?: string;
  notes?: string;
  allocationMode: 'auto' | 'none';
}): Promise<import('../types').SupplierPayment> {
  return request<import('../types').SupplierPayment>(`/supplier-payments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplierPayment(id: string): Promise<void> {
  return request(`/supplier-payments/${id}`, { method: 'DELETE' });
}

/** Advance still on account with a supplier (paid, not yet deducted). */
export async function fetchSupplierAvailableAdvance(supplierName: string): Promise<number> {
  const data = await request<{ available: number }>(
    `/supplier-payments/available/${encodeURIComponent(supplierName)}`
  );
  return data.available;
}

/** Draw an amount off a supplier's advance against one shipment or invoice. */
export async function deductFromSupplierAdvance(payload: {
  supplierName: string;
  targetType: 'resale' | 'invoice';
  targetId: string;
  amount: number;
}): Promise<{ deducted: number; remainingAdvance: number; targetRemaining: number }> {
  return request('/supplier-payments/deduct', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchSupplierInvoices(params?: {
  supplierName?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<import('../types').SupplierInvoice[]> {
  const query = buildQueryString(params);
  return request<import('../types').SupplierInvoice[]>(`/supplier-invoices${query}`);
}

export async function fetchNextSupplierInvoiceId(): Promise<string> {
  const data = await request<{ nextId: string }>('/supplier-invoices/next-id');
  return data.nextId;
}

export async function createSupplierInvoice(payload: {
  id?: string;
  date: string;
  supplierName: string;
  amount: number;
  notes?: string;
}): Promise<import('../types').SupplierInvoice> {
  return request<import('../types').SupplierInvoice>('/supplier-invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Correct a supplier debt/invoice entered wrongly. */
export async function updateSupplierInvoice(id: string, payload: {
  date: string;
  supplierName: string;
  amount: number;
  notes?: string;
}): Promise<import('../types').SupplierInvoice> {
  return request<import('../types').SupplierInvoice>(`/supplier-invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplierInvoice(id: string): Promise<void> {
  return request(`/supplier-invoices/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function buildQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}

