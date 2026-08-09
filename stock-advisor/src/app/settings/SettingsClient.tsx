"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import type { WatchlistEntry } from "@/lib/watchlist";
import styles from "./settings.module.css";

interface Props {
  initialWatchlist: WatchlistEntry[];
}

export default function SettingsClient({ initialWatchlist }: Props) {
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [tickerForm, setTickerForm] = useState({ ticker: "", name: "" });
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function addTicker(e: FormEvent) {
    e.preventDefault();
    setTickerError(null);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: tickerForm.ticker, name: tickerForm.name || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setTickerError(body.error ?? "追加に失敗しました");
      return;
    }
    setWatchlist([...watchlist, body]);
    setTickerForm({ ticker: "", name: "" });
  }

  async function saveName(ticker: string) {
    const res = await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, name: editName }),
    });
    if (res.ok) {
      const updated = await res.json();
      setWatchlist(watchlist.map((w) => (w.ticker === ticker ? updated : w)));
    }
    setEditingTicker(null);
  }

  async function removeTicker(ticker: string) {
    await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" });
    setWatchlist(watchlist.filter((w) => w.ticker !== ticker));
  }


  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>設定</h1>
        <nav className={styles.nav}>
          <Link href="/">← 今日のおすすめへ</Link>
          <Link href="/theory">紫蘇の葉理論スコア →</Link>
          <Link href="/history">判定履歴 →</Link>
        </nav>
      </header>

      <section className={styles.section}>
        <h2>ウォッチリスト</h2>
        <p className={styles.note}>
          「今日のおすすめ」と紫蘇の葉理論スコアの対象になる銘柄です。保有株(/holdings)に登録した銘柄も自動的に対象に含まれます。
        </p>

        <form onSubmit={addTicker} className={styles.form}>
          <input
            placeholder="銘柄コード (例: 7203)"
            value={tickerForm.ticker}
            onChange={(e) => setTickerForm({ ...tickerForm, ticker: e.target.value })}
            className={styles.inputShort}
          />
          <input
            placeholder="銘柄名(任意)"
            value={tickerForm.name}
            onChange={(e) => setTickerForm({ ...tickerForm, name: e.target.value })}
            className={styles.input}
          />
          <button type="submit" className={styles.addButton}>
            追加
          </button>
        </form>
        {tickerError && <p className={styles.error}>{tickerError}</p>}

        <ul className={styles.list}>
          {watchlist.map((w) => (
            <li key={w.ticker} className={styles.row}>
              <span className={styles.code}>{w.ticker}</span>
              {editingTicker === w.ticker ? (
                <>
                  <input
                    aria-label="銘柄名"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName(w.ticker)}
                    className={styles.inlineInput}
                    autoFocus
                  />
                  <button onClick={() => saveName(w.ticker)} className={styles.saveButton}>
                    保存
                  </button>
                  <button onClick={() => setEditingTicker(null)} className={styles.cancelButton}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.label}>{w.name ?? <em className={styles.unnamed}>(名称未設定)</em>}</span>
                  <button
                    onClick={() => {
                      setEditingTicker(w.ticker);
                      setEditName(w.name ?? "");
                    }}
                    className={styles.editButton}
                  >
                    名称変更
                  </button>
                </>
              )}
              <button onClick={() => removeTicker(w.ticker)} className={styles.removeButton}>
                削除
              </button>
            </li>
          ))}
          {watchlist.length === 0 && <li className={styles.empty}>登録がありません。</li>}
        </ul>
      </section>


      <p className={styles.disclaimer}>
        ここで登録した内容は <code>data/watchlist.json</code> に保存されます。ニュースはGoogle News、株価はYahoo Financeから取得しており、
        いずれもAPIキー不要です。判定に必要な有料APIはClaude(<code>ANTHROPIC_API_KEY</code>)のみです。
      </p>
    </main>
  );
}
