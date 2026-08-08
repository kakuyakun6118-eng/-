import { getWatchedAccounts } from "./watchedAccounts";
import { getRecentPosts, normalizeTicker, type SocialPost } from "./socialSource";
import { getWatchlist } from "./watchlist";
import { listHoldings } from "./holdingsStore";
import { scoreTicker } from "./theory";
import { historicalBaselineDaily, jstDateKey, loadMentionHistory } from "./history";
import { ENRICH_CONCURRENCY, X_POST_WINDOW } from "./config";
import { mapWithConcurrency } from "./async";
import type { TheoryScore } from "./types";

export interface AccountPosts {
  handle: string;
  label?: string;
  posts: SocialPost[];
}

export interface WatchedActivity {
  accounts: AccountPosts[];
  /** Every watched account's posts pooled together. */
  allPosts: SocialPost[];
  /** One scorecard per mentioned ticker, strongest first. */
  scores: TheoryScore[];
}

export async function loadWatchedActivity(): Promise<WatchedActivity> {
  const [watched, watchlist, holdings] = await Promise.all([getWatchedAccounts(), getWatchlist(), listHoldings()]);

  // Bare 4-digit numbers in a post only count as codes if they're in the
  // user's own universe — otherwise dates and prices get read as tickers.
  const knownTickers = [...watchlist.map((w) => w.ticker), ...holdings.map((h) => h.ticker)].map(normalizeTicker);

  const accounts: AccountPosts[] = await Promise.all(
    watched.map(async (account) => ({
      handle: account.handle,
      label: account.label,
      posts: await getRecentPosts(account.handle, knownTickers, X_POST_WINDOW),
    }))
  );

  // The theory counts mentions "by the watched accounts", so scoring runs over
  // the pooled posts rather than once per account.
  const allPosts = accounts.flatMap((a) => a.posts);
  const tickers = [...new Set(allPosts.flatMap((p) => p.tickers))];

  // Recorded daily counts give rule 1 a baseline that outlives one API window.
  const now = new Date();
  const history = await loadMentionHistory();
  const today = jstDateKey(now);

  const scores = await mapWithConcurrency(tickers, ENRICH_CONCURRENCY, (ticker) =>
    scoreTicker(ticker, allPosts, now, historicalBaselineDaily(ticker, history, today))
  );
  scores.sort((a, b) => b.total - a.total);

  return { accounts, allPosts, scores };
}

/**
 * Theory scores keyed by ticker, for the recommendation and holdings pages.
 * Returns an empty map when no accounts are watched or X isn't configured.
 */
export async function getTheoryScoresByTicker(): Promise<Map<string, TheoryScore>> {
  const { scores } = await loadWatchedActivity();
  return new Map(scores.map((s) => [s.ticker, s]));
}
