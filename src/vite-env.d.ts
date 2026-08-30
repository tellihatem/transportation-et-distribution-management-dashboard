/// <reference types="vite/client" />

/** Bridge exposed by electron/preload.js — absent in a plain browser. */
interface Window {
  electronAPI?: {
    /** Print via the main process; resolves when the print dialog closes. */
    print: () => Promise<void>;
  };
}
