/**
 * useTrips — Hook for managing Client Transport Trip data via the API
 */

import { useState, useEffect, useCallback } from 'react';
import type { ClientTransportTrip, TabFilters } from '../types';
import { fetchTrips, createTrip, updateTrip, deleteTrip } from '../api/client';

export function useTrips(filters: TabFilters) {
  const [trips, setTrips] = useState<ClientTransportTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTrips({
        search: filters.searchQuery || undefined,
        dateStart: filters.dateStart || undefined,
        dateEnd: filters.dateEnd || undefined,
      });
      setTrips(data);
    } catch (err: any) {
      setError(err.message);
      console.error('[useTrips] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.searchQuery, filters.dateStart, filters.dateEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const addTrip = useCallback(async (trip: ClientTransportTrip) => {
    const created = await createTrip(trip);
    setTrips(prev => [created, ...prev]);
    return created;
  }, []);

  const editTrip = useCallback(async (id: string, trip: Partial<ClientTransportTrip>) => {
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
