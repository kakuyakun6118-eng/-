import { getWatchlist } from "./watchlist";
import { listHoldings } from "./holdingsStore";
import { getNewsFeed } from "./news";
import { scoreTicker } from "./theory";
import { historicalBaselineDaily, jstDateKey, loadMentionHistory } from "./history";
import { mapWithConcurrency } from "./async";
import { ENRICH_CONCURRENCY } from "./config";
import type { NewsItem, TheoryScore } from "./types";

export interface TickerCoverage {
  ticker: string;
  name?: string;
  score: TheoryScore;
  feed: NewsItem[];
}

/** Every ticker the user follows: the watchlist plus anything currently held. */
async function coveredTickers(): Promise<Map<string, string | undefined>> {
  const [watchlist, holdings] = await Promise.all([getWatchlist(), listHoldings()]);
  const map = new Map<string, string | undefined>();
  for (const w of watchlist) map.set(w.ticker, w.name);
  for (const h of holdings) if (!map.has(h.ticker)) map.set(h.ticker, h.name);
  return map;
}

/** Score every followed ticker against the 紫蘇の葉理論 scorecard. */
export async function loadCoverage(): Promise<TickerCoverage[]> {
  const tickers = await coveredTickers();
  const entries = [...tickers.entries()];

  const now = new Date();
  const history = await loadMentionHistory();
  const today = jstDateKey(now);

  const coverage = await mapWithConcurrency(entries, ENRICH_CONCURRENCY, async ([ticker, name]): Promise<TickerCoverage> => {
    const feed = await getNewsFeed(ticker, name);
    const score = await scoreTicker(ticker, feed, now, historicalBaselineDaily(ticker, history, today));
    return { ticker, name, score, feed };
  });

  return coverage.sort((a, b) => b.score.total - a.score.total);
}

/** Theory scores keyed by ticker, for the recommendation and holdings pages. */
export async function getTheoryScoresByTicker(): Promise<Map<string, TheoryScore>> {
  const coverage = await loadCoverage();
  return new Map(coverage.map((c) => [c.ticker, c.score]));
}
