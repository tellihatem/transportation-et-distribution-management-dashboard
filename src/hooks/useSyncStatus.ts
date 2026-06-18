/**
 * useSyncStatus — Hook for monitoring Supabase sync health
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchSyncStatus, pushSync, restoreFromCloud, type SyncStatusData } from '../api/client';

export function useSyncStatus(pollIntervalMs: number = 30000) {
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSyncStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, pollIntervalMs);
    return () => clearInterval(interval);
  }, [load, pollIntervalMs]);

  const forcePush = useCallback(async () => {
    const result = await pushSync();
    await load(); // Refresh status
    return result;
  }, [load]);

  const restore = useCallback(async () => {
    const result = await restoreFromCloud();
    await load(); // Refresh status
    return result;
  }, [load]);

  /**
   * Determine visual sync state for the UI badge
   */
  const syncState = (() => {
    if (!status) return 'loading';
    if (!status.supabaseConfigured) return 'offline';
    if (!status.supabaseReachable) return 'disconnected';
    if (status.pendingQueueItems > 0) return 'syncing';
    if (status.unsyncedRecords > 0) return 'pending';
    return 'synced';
  })();

  return { status, syncState, loading, error, reload: load, forcePush, restore };
}
