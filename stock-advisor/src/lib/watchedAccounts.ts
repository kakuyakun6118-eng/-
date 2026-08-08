import { promises as fs } from "fs";
import path from "path";

export interface WatchedAccount {
  handle: string;
  label?: string;
}

const WATCHED_ACCOUNTS_FILE = path.join(process.cwd(), "data", "watchedAccounts.json");

export async function getWatchedAccounts(): Promise<WatchedAccount[]> {
  const raw = await fs.readFile(WATCHED_ACCOUNTS_FILE, "utf-8");
  return JSON.parse(raw) as WatchedAccount[];
}
