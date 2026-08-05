/**
 * useAppInfo — which build is running and which database file it is using.
 *
 * Fetched once on mount: neither value can change while the app is open, so
 * unlike useSyncStatus there is nothing to poll.
 */

import { useState, useEffect } from 'react';
import { fetchAppInfo, type AppInfo } from '../api/client';

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAppInfo()
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(err => console.error('[useAppInfo] Failed to read build info:', err));
    return () => { cancelled = true; };
  }, []);

  return info;
}
