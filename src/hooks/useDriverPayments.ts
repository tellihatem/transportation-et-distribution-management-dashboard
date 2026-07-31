/**
 * useDriverPayments — Hook for managing Driver Payments and Summaries
 */

import { useState, useEffect, useCallback } from 'react';
import type { DriverPayment, DriverSummary, TabFilters } from '../types';
import {
  fetchDriverPayments,
  fetchDriverSummaries,
  createDriverPayment,
  deleteDriverPayment
} from '../api/client';

export function useDriverPayments(filters?: TabFilters) {
  const [payments, setPayments] = useState<DriverPayment[]>([]);
  const [summaries, setSummaries] = useState<DriverSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [pmtsData, summsData] = await Promise.all([
        fetchDriverPayments({
          dateStart: filters?.dateStart || undefined,
          dateEnd: filters?.dateEnd || undefined
        }),
        fetchDriverSummaries()
      ]);
      setPayments(pmtsData);
      setSummaries(summsData);
    } catch (err: any) {
      setError(err.message);
      console.error('[useDriverPayments] Fetch error:', err);
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
    driverName: string;
    amount: number;
    paymentType?: string;
    notes?: string;
    allocationMode: 'auto' | 'manual' | 'none';
    allocations?: any[];
  }) => {
    const created = await createDriverPayment(payload);
    await load(); // Reload to refresh both driver payouts and summaries
    return created;
  }, [load]);

  const removePayment = useCallback(async (id: string) => {
    await deleteDriverPayment(id);
    await load();
  }, [load]);

  return {
    payments,
    summaries,
    loading,
    error,
    reload: load,
    recordPayment,
    removePayment
  };
}
