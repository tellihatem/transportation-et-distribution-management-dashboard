/**
 * useClientPayments — Hook for managing Client Payments and Summaries
 */

import { useState, useEffect, useCallback } from 'react';
import type { ClientPayment, ClientSummary, TabFilters } from '../types';
import {
  fetchClientPayments,
  fetchClientSummaries,
  createClientPayment,
  updateClientPayment,
  deleteClientPayment
} from '../api/client';

export function useClientPayments(filters?: TabFilters) {
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [summaries, setSummaries] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [pmtsData, summsData] = await Promise.all([
        fetchClientPayments({
          dateStart: filters?.dateStart || undefined,
          dateEnd: filters?.dateEnd || undefined
        }),
        fetchClientSummaries()
      ]);
      setPayments(pmtsData);
      setSummaries(summsData);
    } catch (err: any) {
      setError(err.message);
      console.error('[useClientPayments] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters?.dateStart, filters?.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const recordPayment = useCallback(async (payload: {
    id?: string;
    date: string;
    clientName: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
    allocationMode: 'auto' | 'manual' | 'none';
    allocations?: any[];
  }) => {
    const created = await createClientPayment(payload);
    await load(); // Reload to refresh both payments and summary balances
    return created;
  }, [load]);

  /** Correct a receipt entered with the wrong amount, date, client or note. */
  const updatePayment = useCallback(async (id: string, payload: {
    date: string;
    clientName: string;
    amount: number;
    paymentMethod?: string;
    notes?: string;
    allocationMode: 'auto' | 'none';
  }) => {
    const updated = await updateClientPayment(id, payload);
    await load();
    return updated;
  }, [load]);

  const removePayment = useCallback(async (id: string) => {
    await deleteClientPayment(id);
    await load();
  }, [load]);

  return {
    payments,
    summaries,
    loading,
    error,
    reload: load,
    recordPayment,
    updatePayment,
    removePayment
  };
}
