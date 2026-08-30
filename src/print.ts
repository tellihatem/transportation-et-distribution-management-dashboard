/**
 * printPage — print the current page with a document title override, without
 * the Electron focus-loss bug.
 *
 * In the packaged app, printing goes through the main process
 * (electron/preload.js → webContents.print): its completion callback fires
 * reliably when the print dialog closes — unlike the renderer's afterprint
 * event — and the main process then blurs and refocuses the window, because
 * a closed native print dialog otherwise leaves keyboard focus broken on
 * Windows, exactly like alert()/confirm() did (see AppDialogs.tsx).
 *
 * In a plain browser there is no bridge and no bug: fall back to
 * window.print(), restoring the title on afterprint with a timer as
 * belt-and-braces for engines that skip the event.
 *
 * The title override exists so a statement or receipt saved as PDF is named
 * after its contents rather than after the application.
 */
export async function printPage(documentTitle?: string): Promise<void> {
  const originalTitle = document.title;
  if (documentTitle) document.title = documentTitle;

  const electronPrint = window.electronAPI?.print;
  if (electronPrint) {
    try {
      await electronPrint();
    } finally {
      document.title = originalTitle;
    }
    return;
  }

  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = originalTitle;
  };
  window.addEventListener('afterprint', restoreTitle, { once: true });
  setTimeout(restoreTitle, 120000);
  window.print();
}
