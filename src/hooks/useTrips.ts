/**
 * useTrips — Hook for managing Client Transport Trip data via the API.
 * Thin naming wrapper over the shared list machinery in useFilteredList.
 */

import type { ClientTransportTrip, ClientTransportTripInput, TabFilters } from '../types';
import { fetchTrips, createTrip, updateTrip, deleteTrip } from '../api/client';
import { useFilteredList } from './useFilteredList';

export function useTrips(filters: TabFilters) {
  const list = useFilteredList<ClientTransportTrip, ClientTransportTripInput>(
    'useTrips', filters, fetchTrips, createTrip, updateTrip, deleteTrip
  );
  return {
    trips: list.items,
    loading: list.loading,
    error: list.error,
    reload: list.reload,
    addTrip: list.add,
    editTrip: list.edit,
    removeTrip: list.remove,
  };
}
