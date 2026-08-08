import { dataFile, readList, writeList } from "./jsonStore";

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

  const entries = await getWatchlist();
  if (entries.some((e) => e.ticker === ticker)) throw new Error(`${ticker} は既に登録されています`);

  const entry: WatchlistEntry = { ticker, ...(name?.trim() ? { name: name.trim() } : {}) };
  await writeList(WATCHLIST_FILE, [...entries, entry]);
  return entry;
}

export async function removeWatchlistEntry(ticker: string): Promise<boolean> {
  const entries = await getWatchlist();
  const next = entries.filter((e) => e.ticker !== ticker);
  if (next.length === entries.length) return false;
  await writeList(WATCHLIST_FILE, next);
  return true;
}
