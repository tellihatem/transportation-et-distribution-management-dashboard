/**
 * useResales — Hook for managing Material Resale Transaction data via the API
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MaterialResaleTx, MaterialResaleTxInput, TabFilters } from '../types';
import { fetchResales, createResale, updateResale, deleteResale } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

export function useResales(filters: TabFilters) {
  const [resales, setResales] = useState<MaterialResaleTx[]>([]);
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

      const data = await fetchResales({
        search: debouncedSearch || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      }, controller.signal);
      if (myGeneration !== generation.current) return;
      setResales(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // superseded, not an error
      setError(err.message);
      console.error('[useResales] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.dateStart, filters.dateEnd]);

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
