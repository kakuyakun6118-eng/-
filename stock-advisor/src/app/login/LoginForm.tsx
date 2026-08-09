"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./login.module.css";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "ログインに失敗しました");
        return;
      }
      // Only ever follow an internal path, so `?next=` can't bounce elsewhere.
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>株価インパクト・アドバイザー</h1>
      <p className={styles.note}>続けるにはパスワードを入力してください。</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          autoFocus
        />
        <button type="submit" disabled={busy || password.length === 0} className={styles.button}>
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}
    </main>
  );
}
