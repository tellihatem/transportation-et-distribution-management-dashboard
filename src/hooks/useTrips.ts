/**
 * useTrips — Hook for managing Client Transport Trip data via the API
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClientTransportTrip, ClientTransportTripInput, TabFilters } from '../types';
import { fetchTrips, createTrip, updateTrip, deleteTrip } from '../api/client';
import { useDebouncedValue } from './useDebouncedValue';

export function useTrips(filters: TabFilters) {
  const [trips, setTrips] = useState<ClientTransportTrip[]>([]);
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

      const data = await fetchTrips({
        search: debouncedSearch || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      }, controller.signal);
      if (myGeneration !== generation.current) return;
      setTrips(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // superseded, not an error
      setError(err.message);
      console.error('[useTrips] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const addTrip = useCallback(async (trip: ClientTransportTripInput) => {
    const created = await createTrip(trip);
    setTrips(prev => [created, ...prev]);
    return created;
  }, []);

  const editTrip = useCallback(async (id: string, trip: Partial<ClientTransportTripInput>) => {
    const updated = await updateTrip(id, trip);
    setTrips(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  }, []);

  const removeTrip = useCallback(async (id: string) => {
    await deleteTrip(id);
    setTrips(prev => prev.filter(t => t.id !== id));
  }, []);

  return { trips, loading, error, reload: load, addTrip, editTrip, removeTrip };
}
