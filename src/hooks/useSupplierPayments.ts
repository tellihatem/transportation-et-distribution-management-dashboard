/**
 * useSupplierPayments — Hook for supplier/factory balances, payments and
 * manual invoices. Mirrors useDriverPayments, plus invoice add/remove.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SupplierPayment, SupplierSummary, TabFilters } from '../types';
import {
  fetchSupplierPayments,
  fetchSupplierSummaries,
  createSupplierPayment,
  deleteSupplierPayment,
  createSupplierInvoice,
  deleteSupplierInvoice,
  deductFromSupplierAdvance
} from '../api/client';

export function useSupplierPayments(filters?: TabFilters) {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [summaries, setSummaries] = useState<SupplierSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [pmtsData, summsData] = await Promise.all([
        fetchSupplierPayments({
          dateStart: filters?.dateStart || undefined,
          dateEnd: filters?.dateEnd || undefined
        }),
        fetchSupplierSummaries()
      ]);
      setPayments(pmtsData);
      setSummaries(summsData);
    } catch (err: any) {
      setError(err.message);
      console.error('[useSupplierPayments] Fetch error:', err);
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
    supplierName: string;
    amount: number;
    paymentType?: string;
    notes?: string;
    allocationMode: 'auto' | 'none';
  }) => {
    const created = await createSupplierPayment(payload);
    await load();
    return created;
  }, [load]);

  const removePayment = useCallback(async (id: string) => {
    await deleteSupplierPayment(id);
    await load();
  }, [load]);

  const addInvoice = useCallback(async (payload: {
    id?: string;
    date: string;
    supplierName: string;
    amount: number;
    notes?: string;
  }) => {
    const created = await createSupplierInvoice(payload);
    await load();
    return created;
  }, [load]);

  const removeInvoice = useCallback(async (id: string) => {
    await deleteSupplierInvoice(id);
    await load();
  }, [load]);

  /** Manual drawdown: deduct part of the advance against one delivery. */
  const deductAdvance = useCallback(async (payload: {
    supplierName: string;
    targetType: 'resale' | 'invoice';
    targetId: string;
    amount: number;
  }) => {
    const result = await deductFromSupplierAdvance(payload);
    await load();
    return result;
  }, [load]);

  return {
    payments,
    summaries,
    loading,
    error,
    reload: load,
    recordPayment,
    removePayment,
    addInvoice,
    removeInvoice,
    deductAdvance
  };
}
