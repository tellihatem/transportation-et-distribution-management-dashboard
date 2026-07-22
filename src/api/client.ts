/**
 * API Client — Centralized HTTP client for the Express backend
 * All data operations go through this module.
 */

import type { ClientTransportTrip, MaterialResaleTx, OtherExpense } from '../types';

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

export async function createTrip(trip: ClientTransportTrip): Promise<ClientTransportTrip> {
  return request<ClientTransportTrip>('/trips', {
    method: 'POST',
    body: JSON.stringify(trip),
  });
}

export async function updateTrip(id: string, trip: Partial<ClientTransportTrip>): Promise<ClientTransportTrip> {
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

export async function createResale(resale: MaterialResaleTx): Promise<MaterialResaleTx> {
  return request<MaterialResaleTx>('/resales', {
    method: 'POST',
    body: JSON.stringify(resale),
  });
}

export async function updateResale(id: string, resale: Partial<MaterialResaleTx>): Promise<MaterialResaleTx> {
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

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function buildQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}
