import { getWatchlist } from "./watchlist";
import { getTheoryScoresByTicker } from "./theoryService";
import { getQuote } from "./prices";
import { getHeadlines } from "./news";
import { judgeImpact } from "./llm";
import { buildRecommendation, rankRecommendations } from "./scoring";
import { mapWithConcurrency } from "./async";
import { ENRICH_CONCURRENCY } from "./config";
import type { Recommendation } from "./types";

/**
 * Today's candidates are the watchlist.
 *
 * There is no discovery source any more: without a social feed to mine, a
 * stock has to be on the list before it can be scored. Add names via /settings.
 */
export async function loadRecommendations(): Promise<Recommendation[]> {
  const [watchlist, theoryScores] = await Promise.all([getWatchlist(), getTheoryScoresByTicker()]);

  const names = new Map(watchlist.map((w) => [w.ticker, w.name]));
  const tickers = [...new Set([...watchlist.map((w) => w.ticker), ...theoryScores.keys()])];

  const recs = await mapWithConcurrency(tickers, ENRICH_CONCURRENCY, async (ticker): Promise<Recommendation | null> => {
      const quote = await getQuote(ticker);
      if (!quote) return null;
      const name = names.get(ticker);
      const headlines = await getHeadlines(ticker, name);
      const impact = await judgeImpact(ticker, name, headlines);
    return buildRecommendation(ticker, name, quote, impact, theoryScores.get(ticker) ?? null);
  });

  return rankRecommendations(recs.filter((r): r is Recommendation => r !== null));
}
