/**
 * useFilteredList — the shared machinery behind useTrips / useResales /
 * useExpenses. One implementation of the load pipeline (debounced search,
 * abort of superseded requests, a generation guard against out-of-order
 * responses) and of the optimistic CRUD state updates, so the three list
 * hooks cannot drift apart — they had already been maintained as copy-paste
 * triplets three times over.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TabFilters } from '../types';
import { useDebouncedValue } from './useDebouncedValue';

export interface ListFetchParams {
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}

export function useFilteredList<T extends { id: string }, TInput>(
  tag: string,
  filters: TabFilters,
  fetcher: (params: ListFetchParams, signal?: AbortSignal) => Promise<T[]>,
  creator: (input: TInput) => Promise<T>,
  updater: (id: string, input: Partial<TInput>) => Promise<T>,
  deleter: (id: string) => Promise<void>
) {
  const [items, setItems] = useState<T[]>([]);
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

      const data = await fetcher({
        search: debouncedSearch || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      }, controller.signal);
      if (myGeneration !== generation.current) return;
      setItems(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // superseded, not an error
      setError(err.message);
      console.error(`[${tag}] Fetch error:`, err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (input: TInput) => {
    const created = await creator(input);
    setItems(prev => [created, ...prev]);
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = useCallback(async (id: string, input: Partial<TInput>) => {
    const updated = await updater(id, input);
    setItems(prev => prev.map(item => (item.id === id ? updated : item)));
    return updated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleter(id);
    setItems(prev => prev.filter(item => item.id !== id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loading, error, reload: load, add, edit, remove };
}
