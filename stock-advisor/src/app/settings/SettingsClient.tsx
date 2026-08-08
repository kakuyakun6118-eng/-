"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import type { WatchlistEntry } from "@/lib/watchlist";
import type { WatchedAccount } from "@/lib/watchedAccounts";
import styles from "./settings.module.css";

interface Props {
  initialWatchlist: WatchlistEntry[];
  initialAccounts: WatchedAccount[];
}

export default function SettingsClient({ initialWatchlist, initialAccounts }: Props) {
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [accounts, setAccounts] = useState(initialAccounts);

  const [tickerForm, setTickerForm] = useState({ ticker: "", name: "" });
  const [accountForm, setAccountForm] = useState({ handle: "", label: "" });
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

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

  async function removeTicker(ticker: string) {
    await fetch(`/api/watchlist?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" });
    setWatchlist(watchlist.filter((w) => w.ticker !== ticker));
  }

  async function addAccount(e: FormEvent) {
    e.preventDefault();
    setAccountError(null);
    const res = await fetch("/api/watched-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: accountForm.handle, label: accountForm.label || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setAccountError(body.error ?? "追加に失敗しました");
      return;
    }
    setAccounts([...accounts, body]);
    setAccountForm({ handle: "", label: "" });
  }

  async function removeAccount(handle: string) {
    await fetch(`/api/watched-accounts?handle=${encodeURIComponent(handle)}`, { method: "DELETE" });
    setAccounts(accounts.filter((a) => a.handle !== handle));
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>設定</h1>
        <nav className={styles.nav}>
          <Link href="/">← 今日のおすすめへ</Link>
          <Link href="/watch">注目アカウントの投稿 →</Link>
          <Link href="/history">判定履歴 →</Link>
        </nav>
      </header>

      <section className={styles.section}>
        <h2>ウォッチリスト</h2>
        <p className={styles.note}>
          「今日のおすすめ」で常時チェックする銘柄です。監視アカウントが言及した銘柄は、ここに無くても自動的に候補に入ります。
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
              <span className={styles.label}>{w.name ?? <em className={styles.unnamed}>(名称未設定)</em>}</span>
              <button onClick={() => removeTicker(w.ticker)} className={styles.removeButton}>
                削除
              </button>
            </li>
          ))}
          {watchlist.length === 0 && <li className={styles.empty}>登録がありません。</li>}
        </ul>
      </section>

      <section className={styles.section}>
        <h2>監視アカウント</h2>
        <p className={styles.note}>
          投稿を追跡するXアカウントです。本人の公開投稿を取得して紫蘇の葉理論スコアを算出します。取得には X_BEARER_TOKEN の設定が必要です。
        </p>

        <form onSubmit={addAccount} className={styles.form}>
          <input
            placeholder="ユーザー名 (例: @aleabitoreddit)"
            value={accountForm.handle}
            onChange={(e) => setAccountForm({ ...accountForm, handle: e.target.value })}
            className={styles.input}
          />
          <input
            placeholder="表示名(任意)"
            value={accountForm.label}
            onChange={(e) => setAccountForm({ ...accountForm, label: e.target.value })}
            className={styles.input}
          />
          <button type="submit" className={styles.addButton}>
            追加
          </button>
        </form>
        {accountError && <p className={styles.error}>{accountError}</p>}

        <ul className={styles.list}>
          {accounts.map((a) => (
            <li key={a.handle} className={styles.row}>
              <span className={styles.code}>@{a.handle}</span>
              <span className={styles.label}>{a.label ?? <em className={styles.unnamed}>(表示名未設定)</em>}</span>
              <a href={`https://x.com/${a.handle}`} target="_blank" rel="noreferrer" className={styles.profileLink}>
                プロフィール
              </a>
              <button onClick={() => removeAccount(a.handle)} className={styles.removeButton}>
                削除
              </button>
            </li>
          ))}
          {accounts.length === 0 && <li className={styles.empty}>登録がありません。</li>}
        </ul>
      </section>

      <p className={styles.disclaimer}>
        ここで登録した内容は <code>data/watchlist.json</code> と <code>data/watchedAccounts.json</code> に保存されます。
        監視アカウントの投稿は本人の公開投稿をそのまま引用するもので、当アプリがその人物になりすまして発言を生成することはありません。
      </p>
    </main>
  );
}
