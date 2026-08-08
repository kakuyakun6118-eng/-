import { dataFile, readList, updateList } from "./jsonStore";

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

  const account: WatchedAccount = { handle, ...(label?.trim() ? { label: label.trim() } : {}) };

  return updateList<WatchedAccount, WatchedAccount>(WATCHED_ACCOUNTS_FILE, (accounts) => {
    if (accounts.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) {
      throw new Error(`@${handle} は既に登録されています`);
    }
    return { items: [...accounts, account], result: account };
  });
}

export async function removeWatchedAccount(handle: string): Promise<boolean> {
  return updateList<WatchedAccount, boolean>(WATCHED_ACCOUNTS_FILE, (accounts) => {
    const items = accounts.filter((a) => a.handle.toLowerCase() !== handle.toLowerCase());
    return { items, result: items.length !== accounts.length };
  });
}
