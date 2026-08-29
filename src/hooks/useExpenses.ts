/**
 * useExpenses — Hook for managing Other Expense data via the API.
 * Thin naming wrapper over the shared list machinery in useFilteredList.
 */

import type { OtherExpense, TabFilters } from '../types';
import { fetchExpenses, createExpense, updateExpense, deleteExpenseApi } from '../api/client';
import { useFilteredList } from './useFilteredList';

export function useExpenses(filters: TabFilters) {
  const list = useFilteredList<OtherExpense, OtherExpense>(
    'useExpenses', filters, fetchExpenses, createExpense, updateExpense, deleteExpenseApi
  );
  return {
    expenses: list.items,
    loading: list.loading,
    error: list.error,
    reload: list.reload,
    addExpense: list.add,
    editExpense: list.edit,
    removeExpense: list.remove,
  };
}
