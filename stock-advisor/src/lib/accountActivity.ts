import { getWatchedAccounts } from "./watchedAccounts";
import { getRecentPosts, normalizeTicker, type SocialPost } from "./socialSource";
import { getWatchlist } from "./watchlist";
import { listHoldings } from "./holdingsStore";
import { scoreTicker } from "./theory";
import type { TheoryScore } from "./types";

export interface AccountActivity {
  handle: string;
  label?: string;
  posts: SocialPost[];
  scores: TheoryScore[];
}

/**
 * Rule 1 of the theory compares the last 24h against the accounts' own
 * baseline, so the window has to reach back well past a single day. 100 is
 * the X API's per-request maximum for a user timeline.
 */
const POST_WINDOW = 100;

export async function loadAccountActivity(): Promise<AccountActivity[]> {
  const [accounts, watchlist, holdings] = await Promise.all([getWatchedAccounts(), getWatchlist(), listHoldings()]);

  // Bare 4-digit numbers in a post only count as codes if they're in the
  // user's own universe — otherwise dates and prices get read as tickers.
  const knownTickers = [...watchlist.map((w) => w.ticker), ...holdings.map((h) => h.ticker)].map(normalizeTicker);

  return Promise.all(
    accounts.map(async (account): Promise<AccountActivity> => {
      const posts = await getRecentPosts(account.handle, knownTickers, POST_WINDOW);
      const tickers = [...new Set(posts.flatMap((p) => p.tickers))];
      const scores = await Promise.all(tickers.map((ticker) => scoreTicker(ticker, posts)));

      // Lead with the strongest scorecard.
      scores.sort((a, b) => b.total - a.total);

      return { handle: account.handle, label: account.label, posts, scores };
    })
  );
}
