/**
 * useExpenses — Hook for managing Other Expense data via the API
 */

import { useState, useEffect, useCallback } from 'react';
import type { OtherExpense, TabFilters } from '../types';
import { fetchExpenses, createExpense, updateExpense, deleteExpenseApi } from '../api/client';

export function useExpenses(filters: TabFilters) {
  const [expenses, setExpenses] = useState<OtherExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchExpenses({
        search: filters.searchQuery || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      });
      setExpenses(data);
    } catch (err: any) {
      setError(err.message);
      console.error('[useExpenses] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.searchQuery, filters.dateStart, filters.dateEnd]);

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
