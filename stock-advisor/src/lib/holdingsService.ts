import { listHoldings } from "./holdingsStore";
import { getQuote } from "./prices";
import { getHeadlines } from "./news";
import { judgeImpact } from "./llm";
import { getTheoryScoresByTicker } from "./theoryService";
import { buildHoldingVerdict } from "./scoring";
import { mapWithConcurrency } from "./async";
import { ENRICH_CONCURRENCY } from "./config";
import type { HoldingVerdict } from "./types";

/** Sell/hold verdicts for every holding, shared by the API route and the notifier. */
export async function loadHoldingVerdicts(): Promise<HoldingVerdict[]> {
  const [holdings, theoryScores] = await Promise.all([listHoldings(), getTheoryScoresByTicker()]);

  return mapWithConcurrency(holdings, ENRICH_CONCURRENCY, async (holding) => {
      const quote = await getQuote(holding.ticker);
      const headlines = await getHeadlines(holding.ticker, holding.name);
      const impact = await judgeImpact(holding.ticker, holding.name, headlines);
    return buildHoldingVerdict(holding, quote, impact, theoryScores.get(holding.ticker) ?? null);
  });
}
