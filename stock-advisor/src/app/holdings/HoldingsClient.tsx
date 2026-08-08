"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import type { Holding, HoldingVerdict } from "@/lib/types";
import styles from "./holdings.module.css";

const ACTION_LABEL: Record<string, string> = {
  sell: "売却検討",
  watch: "様子見(利確検討)",
  hold: "継続保有",
};

export default function HoldingsClient({ initialHoldings }: { initialHoldings: Holding[] }) {
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [verdicts, setVerdicts] = useState<HoldingVerdict[] | null>(null);
  const [loadingVerdicts, setLoadingVerdicts] = useState(false);
  const [form, setForm] = useState({ ticker: "", name: "", shares: "", costBasis: "", note: "" });
  const [error, setError] = useState<string | null>(null);

  async function refreshHoldings() {
    const res = await fetch("/api/holdings");
    setHoldings(await res.json());
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.ticker || !form.shares || !form.costBasis) {
      setError("銘柄コード・株数・取得単価は必須です");
      return;
    }
    const res = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: form.ticker,
        name: form.name || undefined,
        shares: Number(form.shares),
        costBasis: Number(form.costBasis),
        note: form.note || undefined,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "追加に失敗しました");
      return;
    }
    setForm({ ticker: "", name: "", shares: "", costBasis: "", note: "" });
    setVerdicts(null);
    await refreshHoldings();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/holdings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setVerdicts(null);
    await refreshHoldings();
  }

  async function handleCheckVerdicts() {
    setLoadingVerdicts(true);
    try {
      const res = await fetch("/api/holdings/verdicts");
      setVerdicts(await res.json());
    } finally {
      setLoadingVerdicts(false);
    }
  }

  const verdictByHoldingId = new Map((verdicts ?? []).map((v) => [v.holding.id, v]));

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>保有株の売り時判定</h1>
        <nav className={styles.nav}>
          <Link href="/">← 今日のおすすめへ</Link>
          <Link href="/watch">注目アカウントの投稿 →</Link>
          <Link href="/history">判定履歴 →</Link>
        </nav>
      </header>

      <p className={styles.disclaimer}>
        表示される「売却検討」「継続保有」等はニュース要約とルールベース・LLMによる参考情報であり、投資助言ではありません。売買判断はご自身の責任で行ってください。
      </p>

      <form onSubmit={handleAdd} className={styles.form}>
        <input placeholder="銘柄コード (例: 7203.T)" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
        <input placeholder="銘柄名(任意)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="株数" type="number" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} />
        <input placeholder="取得単価(円)" type="number" value={form.costBasis} onChange={(e) => setForm({ ...form, costBasis: e.target.value })} />
        <input placeholder="メモ(任意)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button type="submit">追加</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}

      <button onClick={handleCheckVerdicts} disabled={loadingVerdicts || holdings.length === 0} className={styles.checkButton}>
        {loadingVerdicts ? "判定中…" : "売り時を判定する"}
      </button>

      <ul className={styles.list}>
        {holdings.map((h) => {
          const verdict = verdictByHoldingId.get(h.id);
          return (
            <li key={h.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.ticker}>{h.ticker}</span>
                <span className={styles.name}>{h.name}</span>
                <span className={styles.shares}>
                  {h.shares}株 @ {h.costBasis.toLocaleString()}円
                </span>
                {verdict && <span className={`${styles.badge} ${styles[verdict.action]}`}>{ACTION_LABEL[verdict.action]}</span>}
                <button className={styles.deleteButton} onClick={() => handleDelete(h.id)}>
                  削除
                </button>
              </div>
              {h.note && <p className={styles.note}>{h.note}</p>}
              {verdict && (
                <div className={styles.verdictBody}>
                  {verdict.quote && (
                    <div className={styles.metrics}>
                      <span>現在値 {verdict.quote.price.toLocaleString()} 円</span>
                      {verdict.unrealizedPnLPercent !== null && <span>含み損益 {verdict.unrealizedPnLPercent.toFixed(1)}%</span>}
                      {verdict.theory && (
                        <span className={styles.theoryTag}>
                          監視アカウント言及 / 紫蘇の葉理論 {verdict.theory.total > 0 ? `+${verdict.theory.total}` : verdict.theory.total}点
                        </span>
                      )}
                    </div>
                  )}
                  <p className={styles.reasoning}>{verdict.reasoning}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
