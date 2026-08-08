import { dataFile, readList, updateList } from "./jsonStore";

export interface WatchlistEntry {
  ticker: string;
  name?: string;
}

const WATCHLIST_FILE = dataFile("watchlist.json");

/**
 * Accept what a person would actually type or paste — a bare code, a code with
 * the Yahoo suffix, or one wrapped in the brackets used in Japanese posts —
 * and return the canonical `XXXX.T` form. Returns null if it isn't a code.
 *
 * Japanese tickers are four characters: four digits, or three digits and a
 * trailing letter for listings issued since 2024 (e.g. 130A).
 */
export function normalizeTickerInput(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[【[(（]|[】\])）]$/g, "").replace(/\.T$/i, "").trim();
  if (!/^\d{3}[\dA-Z]$/i.test(cleaned)) return null;
  return `${cleaned.toUpperCase()}.T`;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  return readList<WatchlistEntry>(WATCHLIST_FILE);
}

export async function addWatchlistEntry(tickerInput: string, name?: string): Promise<WatchlistEntry> {
  const ticker = normalizeTickerInput(tickerInput);
  if (!ticker) throw new Error("銘柄コードは4桁(例: 7203)で入力してください");
  const entry: WatchlistEntry = { ticker, ...(name?.trim() ? { name: name.trim() } : {}) };

  return updateList<WatchlistEntry, WatchlistEntry>(WATCHLIST_FILE, (entries) => {
    if (entries.some((e) => e.ticker === ticker)) throw new Error(`${ticker} は既に登録されています`);
    return { items: [...entries, entry], result: entry };
  });
}

export async function renameWatchlistEntry(ticker: string, name: string): Promise<WatchlistEntry | null> {
  const trimmed = name.trim();
  return updateList<WatchlistEntry, WatchlistEntry | null>(WATCHLIST_FILE, (entries) => {
    const idx = entries.findIndex((e) => e.ticker === ticker);
    if (idx === -1) return { items: entries, result: null };
    const updated: WatchlistEntry = { ticker, ...(trimmed ? { name: trimmed } : {}) };
    const items = [...entries];
    items[idx] = updated;
    return { items, result: updated };
  });
}

export async function removeWatchlistEntry(ticker: string): Promise<boolean> {
  return updateList<WatchlistEntry, boolean>(WATCHLIST_FILE, (entries) => {
    const items = entries.filter((e) => e.ticker !== ticker);
    return { items, result: items.length !== entries.length };
  });
}
