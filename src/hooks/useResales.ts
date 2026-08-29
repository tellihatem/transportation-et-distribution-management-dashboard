/**
 * useResales — Hook for managing Material Resale Transaction data via the API.
 * Thin naming wrapper over the shared list machinery in useFilteredList.
 */

import type { MaterialResaleTx, MaterialResaleTxInput, TabFilters } from '../types';
import { fetchResales, createResale, updateResale, deleteResale } from '../api/client';
import { useFilteredList } from './useFilteredList';

export function useResales(filters: TabFilters) {
  const list = useFilteredList<MaterialResaleTx, MaterialResaleTxInput>(
    'useResales', filters, fetchResales, createResale, updateResale, deleteResale
  );
  return {
    resales: list.items,
    loading: list.loading,
    error: list.error,
    reload: list.reload,
    addResale: list.add,
    editResale: list.edit,
    removeResale: list.remove,
  };
}
