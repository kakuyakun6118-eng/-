import { dataFile, readList, writeList } from "./jsonStore";

export interface WatchedAccount {
  handle: string;
  label?: string;
}

const WATCHED_ACCOUNTS_FILE = dataFile("watchedAccounts.json");

/**
 * Accept `@name`, a bare `name`, or a pasted profile URL, and return the bare
 * handle. Returns null if what's left isn't a valid X handle (letters, digits
 * and underscores, up to 15 characters).
 */
export function normalizeHandleInput(raw: string): string | null {
  const withoutUrl = raw.trim().replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, "");
  const handle = withoutUrl.replace(/^@/, "").split(/[/?#]/)[0].trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return handle;
}

export async function getWatchedAccounts(): Promise<WatchedAccount[]> {
  return readList<WatchedAccount>(WATCHED_ACCOUNTS_FILE);
}

export async function addWatchedAccount(handleInput: string, label?: string): Promise<WatchedAccount> {
  const handle = normalizeHandleInput(handleInput);
  if (!handle) throw new Error("Xのユーザー名を入力してください(例: @aleabitoreddit)");

  const accounts = await getWatchedAccounts();
  if (accounts.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
    throw new Error(`@${handle} は既に登録されています`);
  }

  const account: WatchedAccount = { handle, ...(label?.trim() ? { label: label.trim() } : {}) };
  await writeList(WATCHED_ACCOUNTS_FILE, [...accounts, account]);
  return account;
}

export async function removeWatchedAccount(handle: string): Promise<boolean> {
  const accounts = await getWatchedAccounts();
  const next = accounts.filter((a) => a.handle.toLowerCase() !== handle.toLowerCase());
  if (next.length === accounts.length) return false;
  await writeList(WATCHED_ACCOUNTS_FILE, next);
  return true;
}
