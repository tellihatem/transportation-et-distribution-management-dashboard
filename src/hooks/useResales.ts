/**
 * useResales — Hook for managing Material Resale Transaction data via the API
 */

import { useState, useEffect, useCallback } from 'react';
import type { MaterialResaleTx, MaterialResaleTxInput, TabFilters } from '../types';
import { fetchResales, createResale, updateResale, deleteResale } from '../api/client';

export function useResales(filters: TabFilters) {
  const [resales, setResales] = useState<MaterialResaleTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchResales({
        search: filters.searchQuery || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      });
      setResales(data);
    } catch (err: any) {
      setError(err.message);
      console.error('[useResales] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.searchQuery, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const addResale = useCallback(async (resale: MaterialResaleTxInput) => {
    const created = await createResale(resale);
    setResales(prev => [created, ...prev]);
    return created;
  }, []);

  const editResale = useCallback(async (id: string, resale: Partial<MaterialResaleTxInput>) => {
    const updated = await updateResale(id, resale);
    setResales(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  const removeResale = useCallback(async (id: string) => {
    await deleteResale(id);
    setResales(prev => prev.filter(r => r.id !== id));
  }, []);

  return { resales, loading, error, reload: load, addResale, editResale, removeResale };
}
