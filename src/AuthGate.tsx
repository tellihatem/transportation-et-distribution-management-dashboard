import React, { useEffect, useState } from "react";
import { T } from "./strings";

async function checkAuth(): Promise<boolean> {
  const res = await fetch("/api/auth/me");
  const json = await res.json();
  return Boolean(json?.data?.authenticated);
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authed" | "unauthed">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuth()
      .then(authed => setStatus(authed ? "authed" : "unauthed"))
      .catch(() => setStatus("unauthed"));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error?.code === "AUTH_NOT_CONFIGURED"
          ? T.auth.notConfigured
          : T.auth.wrongPassword);
        return;
      }
      setStatus("authed");
    } catch {
      setError(T.auth.connectionFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-slate-400 text-sm">
        {T.auth.checkingSession}
      </div>
    );
  }

  if (status === "unauthed") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" dir="rtl">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-4"
        >
          <h1 className="text-lg font-bold text-slate-100 text-center">
            {T.brand.companyName}
          </h1>
          <p className="text-xs text-slate-400 text-center">{T.auth.prompt}</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={T.auth.passwordPlaceholder}
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-bold transition"
          >
            {submitting ? T.auth.submitting : T.auth.submit}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
