import { promises as fs } from "fs";
import path from "path";

export interface WatchlistEntry {
  ticker: string;
  name?: string;
}

const WATCHLIST_FILE = path.join(process.cwd(), "data", "watchlist.json");

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const raw = await fs.readFile(WATCHLIST_FILE, "utf-8");
  return JSON.parse(raw) as WatchlistEntry[];
}
