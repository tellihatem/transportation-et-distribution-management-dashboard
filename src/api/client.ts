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
 * Generic fetch wrapper with error handling
 */
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
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
}): Promise<ClientTransportTrip[]> {
  const query = buildQueryString(params);
  return request<ClientTransportTrip[]>(`/trips${query}`);
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
}): Promise<MaterialResaleTx[]> {
  const query = buildQueryString(params);
  return request<MaterialResaleTx[]>(`/resales${query}`);
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
}): Promise<OtherExpense[]> {
  const query = buildQueryString(params);
  return request<OtherExpense[]>(`/expenses${query}`);
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

export async function deleteDriverPayment(id: string): Promise<void> {
  return request(`/driver-payments/${id}`, { method: 'DELETE' });
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

