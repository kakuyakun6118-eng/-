"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./history.module.css";

export default function RecordButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRecord() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/history/record", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? "記録に失敗しました");
        return;
      }
      setMessage(`${body.date} の判定を${body.tickersRecorded}銘柄分記録しました。`);
      router.refresh();
    } catch {
      setMessage("記録に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.recordControl}>
      <button onClick={handleRecord} disabled={busy} className={styles.recordButton}>
        {busy ? "記録中…" : "今日の判定を記録"}
      </button>
      {message && <span className={styles.recordMessage}>{message}</span>}
    </span>
  );
}
