"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "登入失敗");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon">🔒</div>
        <h1>英文對話練習</h1>
        <p className="login-sub">輸入密碼先可以使用</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密碼"
          autoFocus
          autoComplete="current-password"
        />
        {error && <div className="login-error">⚠️ {error}</div>}
        <button type="submit" disabled={busy || !password}>
          {busy ? "登入緊…" : "登入"}
        </button>
      </form>
    </div>
  );
}
