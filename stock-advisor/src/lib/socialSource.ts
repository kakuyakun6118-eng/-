import type { NewsItem } from "./types";

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

/** JP stock codes: 4 digits, optionally already suffixed with .T */
const TICKER_REGEX = /(\d{4})(?:\.T)?/g;

export function extractTickers(text: string): string[] {
  const matches = new Set<string>();
  for (const m of text.matchAll(TICKER_REGEX)) {
    matches.add(`${m[1]}.T`);
  }
  return [...matches];
}

export async function getRecentPosts(handle: string, maxResults = 10): Promise<SocialPost[]> {
  if (!process.env.X_BEARER_TOKEN) {
    console.warn(`[social] X_BEARER_TOKEN is not set, skipping fetch for @${handle}`);
    return [];
  }
  try {
    const userId = await getUserIdByHandle(handle);
    if (!userId) return [];
    const data = await xFetch<{ data?: XPostRaw[] }>(
      `/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at&exclude=retweets,replies`
    );
    return (data.data ?? []).map((t) => ({
      handle,
      id: t.id,
      text: t.text,
      url: `https://x.com/${handle}/status/${t.id}`,
      createdAt: t.created_at,
      tickers: extractTickers(t.text),
    }));
  } catch (err) {
    console.error(`[social] failed to fetch posts for @${handle}`, err);
    return [];
  }
}

/** Turn the subset of posts mentioning `ticker` into NewsItems the existing LLM judgment pipeline can consume. */
export function postsToNewsItems(ticker: string, posts: SocialPost[]): NewsItem[] {
  return posts
    .filter((p) => p.tickers.includes(ticker))
    .map((p) => ({
      ticker,
      title: p.text,
      link: p.url,
      pubDate: p.createdAt,
      source: `X @${p.handle}`,
    }));
}
