/**
 * useExpenses — Hook for managing Other Expense data via the API
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OtherExpense, TabFilters } from '../types';
import { fetchExpenses, createExpense, updateExpense, deleteExpenseApi } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

export function useExpenses(filters: TabFilters) {
  const [expenses, setExpenses] = useState<OtherExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One request burst per pause in typing, and never a stale overwrite: the
  // previous request is aborted and, belt-and-braces, a generation counter
  // discards any response that still lands out of order.
  const debouncedSearch = useDebouncedValue(filters.searchQuery, 300);
  const generation = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      const myGeneration = ++generation.current;

      const data = await fetchExpenses({
        search: debouncedSearch || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      }, controller.signal);
      if (myGeneration !== generation.current) return;
      setExpenses(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // superseded, not an error
      setError(err.message);
      console.error('[useExpenses] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const addExpense = useCallback(async (expense: OtherExpense) => {
    const created = await createExpense(expense);
    setExpenses(prev => [created, ...prev]);
    return created;
  }, []);

  const editExpense = useCallback(async (id: string, expense: Partial<OtherExpense>) => {
    const updated = await updateExpense(id, expense);
    setExpenses(prev => prev.map(e => e.id === id ? updated : e));
    return updated;
  }, []);

  const removeExpense = useCallback(async (id: string) => {
    await deleteExpenseApi(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  return { expenses, loading, error, reload: load, addExpense, editExpense, removeExpense };
}
