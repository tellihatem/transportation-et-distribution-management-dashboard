/**
 * Debounce a fast-changing value.
 *
 * The search box feeds three list fetches; typing a name used to fire three
 * HTTP requests per keystroke at a server that shares the Electron main
 * thread. The lists now follow the debounced value, so a burst of keystrokes
 * costs one round of requests. Date-filter changes bypass this on purpose —
 * they are single deliberate clicks.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
