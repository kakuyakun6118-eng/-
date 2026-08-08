import { cached, TTL } from "./cache";
import { recordFailure } from "./dataHealth";

/**
 * Fetches an X (Twitter) account's own public posts via the X API v2.
 * This surfaces the account's real, attributed posts as-is — it does not
 * synthesize or paraphrase anything in their voice. Requires the account
 * owner's own paid API access (X_BEARER_TOKEN).
 */

const X_API_BASE = "https://api.x.com/2";

interface XUserLookup {
  id: string;
  username: string;
  name: string;
}

interface XPostRaw {
  id: string;
  text: string;
  created_at: string;
}

async function xFetch<T>(path: string): Promise<T> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN is not set");
  const res = await fetch(`${X_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`X API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function getUserIdByHandle(handle: string): Promise<string | null> {
  const data = await xFetch<{ data?: XUserLookup }>(`/users/by/username/${encodeURIComponent(handle)}`);
  return data.data?.id ?? null;
}

export interface SocialPost {
  handle: string;
  id: string;
  text: string;
  url: string;
  createdAt: string;
  tickers: string[];
}

/**
 * Patterns where a 4-digit run is explicitly marked up as a stock code.
 * A bare number in prose is far more often a year, a price or a share count,
 * so those are only accepted via the known-universe path below.
 */
const MARKED_PATTERNS: RegExp[] = [
  /(?<!\d)(\d{4})\.T(?![\w.])/gi, // 7203.T
  /[【[](\d{4})[\]】]/g, // 【7203】
  /[(（](\d{4})[)）]/g, // (7203)
  /[$＄#＃](\d{4})(?!\d)/g, // $7203 / #7203
  /(?:証券|銘柄)?コード[\s::]*(\d{4})(?!\d)/g, // 証券コード:7203
];

/** A bare 4-digit run followed by one of these is a quantity, not a code. */
const NON_TICKER_SUFFIX = /^(?:年|月|日|円|株|時|分|秒|人|件|億|万|%|％|ドル|ポイント|pt\b)/;

const BARE_FOUR_DIGITS = /(?<!\d)(\d{4})(?!\d)/g;

export function normalizeTicker(raw: string): string {
  const digits = raw.trim().replace(/\.T$/i, "");
  return `${digits}.T`;
}

/**
 * Pull JP stock codes out of free text.
 *
 * `knownTickers` is the user's own universe (watchlist + holdings). Bare
 * numbers are only treated as codes when they appear there, which keeps
 * dates and prices from being read as tickers.
 */
export function extractTickers(text: string, knownTickers: Iterable<string> = []): string[] {
  const found = new Set<string>();

  for (const pattern of MARKED_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      found.add(normalizeTicker(m[1]));
    }
  }

  const known = new Set([...knownTickers].map(normalizeTicker));
  if (known.size > 0) {
    for (const m of text.matchAll(BARE_FOUR_DIGITS)) {
      const ticker = normalizeTicker(m[1]);
      if (!known.has(ticker)) continue;
      if (NON_TICKER_SUFFIX.test(text.slice(m.index + m[0].length))) continue;
      found.add(ticker);
    }
  }

  return [...found];
}

export async function getRecentPosts(handle: string, knownTickers: Iterable<string> = [], maxResults = 10): Promise<SocialPost[]> {
  if (!process.env.X_BEARER_TOKEN) {
    console.warn(`[social] X_BEARER_TOKEN is not set, skipping fetch for @${handle}`);
    return [];
  }
  // X's free/basic tiers rate-limit hard, so raw posts are cached and the
  // ticker pass is re-run on each call (it's pure and depends on the universe).
  const raw = await cached(`social:${handle}:${maxResults}`, TTL.social, async (): Promise<XPostRaw[]> => {
    try {
      const userId = await getUserIdByHandle(handle);
      if (!userId) return [];
      const data = await xFetch<{ data?: XPostRaw[] }>(
        `/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at&exclude=retweets,replies`
      );
      return data.data ?? [];
    } catch (err) {
      console.error(`[social] failed to fetch posts for @${handle}`, err);
      recordFailure("social", err);
      return [];
    }
  });

  return raw.map((t) => ({
    handle,
    id: t.id,
    text: t.text,
    url: `https://x.com/${handle}/status/${t.id}`,
    createdAt: t.created_at,
    tickers: extractTickers(t.text, knownTickers),
  }));
}
