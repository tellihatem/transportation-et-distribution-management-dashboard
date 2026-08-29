/**
 * AppDialogs — in-app replacements for window.alert / window.confirm.
 *
 * Native alert()/confirm() must never be called in this app: in Electron on
 * Windows, closing a native dialog breaks the window's keyboard focus, and
 * every input on the page silently stops accepting keystrokes until the
 * window is unfocused and refocused (electron/electron#31917, #40212,
 * #41602). These dialogs stay inside the page, so focus is never handed to
 * the OS — and they render in the app's own language and styling, which the
 * OS-chrome dialogs never did.
 *
 * appAlert()/appConfirm() are plain async functions callable from anywhere;
 * <DialogHost /> must be mounted once, in App. Requests queue and show one
 * at a time.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { T } from "../strings";

interface DialogRequest {
  kind: "alert" | "confirm";
  message: string;
  resolve: (accepted: boolean) => void;
}

// The host swaps its real enqueue in on mount; a call made before that (or
// after an unmount) waits here and drains when the host appears.
let enqueue: ((req: DialogRequest) => void) | null = null;
const preMountQueue: DialogRequest[] = [];

function submit(req: DialogRequest) {
  if (enqueue) enqueue(req);
  else preMountQueue.push(req);
}

/** Drop-in replacement for window.alert(). Resolves when dismissed. */
export function appAlert(message: string): Promise<void> {
  return new Promise(resolve => submit({ kind: "alert", message, resolve: () => resolve() }));
}

/** Drop-in replacement for window.confirm(). */
export function appConfirm(message: string): Promise<boolean> {
  return new Promise(resolve => submit({ kind: "confirm", message, resolve }));
}

export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    enqueue = req => setQueue(q => [...q, req]);
    if (preMountQueue.length) {
      const drained = preMountQueue.splice(0);
      setQueue(q => [...q, ...drained]);
    }
    return () => {
      enqueue = null;
    };
  }, []);

  const current: DialogRequest | undefined = queue[0];

  const close = (accepted: boolean) => {
    current?.resolve(accepted);
    setQueue(q => q.slice(1));
  };

  // The OK button gets focus, so Enter/Space activate it natively and focus
  // stays inside the page when the dialog closes. Escape dismisses.
  useEffect(() => {
    if (!current) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        current.resolve(false);
        setQueue(q => q.slice(1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  if (!current) return null;
  const isConfirm = current.kind === "confirm";

  return (
    <div className="no-print fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 max-w-sm w-full rounded-2xl overflow-hidden p-5 shadow-2xl relative">
        <div
          className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
            isConfirm ? "from-rose-500 to-amber-500" : "from-blue-500 to-cyan-500"
          }`}
        ></div>

        <div className="flex items-start gap-3 pt-1">
          <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${isConfirm ? "text-rose-400" : "text-blue-400"}`} />
          <div>
            <h3 className="text-sm font-extrabold text-slate-100 mb-1.5">
              {isConfirm ? T.dialogs.confirmTitle : T.dialogs.alertTitle}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{current.message}</p>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
          {isConfirm && (
            <button
              type="button"
              onClick={() => close(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
            >
              {T.dialogs.cancel}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            onClick={() => close(true)}
            className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition ${
              isConfirm
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/10"
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
            }`}
          >
            {isConfirm ? T.dialogs.confirmOk : T.dialogs.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
