import React, { useEffect, useState } from "react";

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
          ? "لم يتم إعداد كلمة المرور على الخادم بعد."
          : "كلمة المرور غير صحيحة");
        return;
      }
      setStatus("authed");
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-slate-400 text-sm">
        جارٍ التحقق من الجلسة...
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
            نقل وتوزيع البضائع لعلاوي عبد المالك
          </h1>
          <p className="text-xs text-slate-400 text-center">أدخل كلمة المرور للدخول إلى لوحة التحكم</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-bold transition"
          >
            {submitting ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
