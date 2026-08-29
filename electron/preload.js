/**
 * Preload — the only bridge between the page and the main process.
 *
 * Exposes exactly one capability: printing via the main process. The renderer
 * must not call window.print() directly in the packaged app — closing the
 * native print dialog breaks the window's keyboard focus on Windows, the same
 * way alert()/confirm() did (see src/components/AppDialogs.tsx), and the
 * renderer has no reliable way to know when the dialog closed (afterprint is
 * not always delivered). The main process prints instead: its completion
 * callback is reliable, and it re-asserts window focus afterwards.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Print the page; resolves when the print dialog is closed (printed or cancelled). */
  print: () => ipcRenderer.invoke('app:print'),
});
