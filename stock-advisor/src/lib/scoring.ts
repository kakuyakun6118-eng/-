import type { Holding, HoldingVerdict, ImpactJudgment, PriceQuote, Recommendation } from "./types";
import { volumeRatio } from "./prices";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function technicalScore(quote: PriceQuote): number {
  const changeComponent = clamp(quote.changePercent * 5, -50, 50);
  const ratio = volumeRatio(quote);
  const volumeComponent = ratio ? clamp((ratio - 1) * 20, 0, 30) : 0;
  return changeComponent + volumeComponent;
}

export function buildRecommendation(ticker: string, name: string | undefined, quote: PriceQuote, impact: ImpactJudgment): Recommendation {
  const combinedScore = Math.round(impact.score * 0.6 + technicalScore(quote) * 0.4);
  const verdict = combinedScore >= 20 ? "positive" : combinedScore <= -20 ? "negative" : "neutral";
  return { ticker, name, quote, impact, combinedScore, verdict };
}

export function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => b.combinedScore - a.combinedScore);
}

const SELL_ON_BAD_NEWS_THRESHOLD = -40;
const LOSS_CUT_THRESHOLD_PERCENT = -15;
const PROFIT_TAKE_THRESHOLD_PERCENT = 25;

export function buildHoldingVerdict(holding: Holding, quote: PriceQuote | null, impact: ImpactJudgment | null): HoldingVerdict {
  const unrealizedPnLPercent = quote ? ((quote.price - holding.costBasis) / holding.costBasis) * 100 : null;
  const pnlText = unrealizedPnLPercent !== null ? `含み損益 ${unrealizedPnLPercent.toFixed(1)}%。` : "現在値を取得できませんでした。";
  const impactText = impact ? impact.reasoning : "ニュース材料は未取得です。";

  if (impact && impact.verdict === "negative" && impact.score <= SELL_ON_BAD_NEWS_THRESHOLD) {
    return {
      holding,
      quote,
      unrealizedPnLPercent,
      impact,
      action: "sell",
      reasoning: `悪材料の影響度が大きいため売却を検討する余地があります。${pnlText} ${impactText}`,
    };
  }

  if (unrealizedPnLPercent !== null && unrealizedPnLPercent <= LOSS_CUT_THRESHOLD_PERCENT && (!impact || impact.verdict !== "positive")) {
    return {
      holding,
      quote,
      unrealizedPnLPercent,
      impact,
      action: "sell",
      reasoning: `含み損が大きく、好材料も見当たらないため損切りを検討する水準です。${pnlText} ${impactText}`,
    };
  }

  if (unrealizedPnLPercent !== null && unrealizedPnLPercent >= PROFIT_TAKE_THRESHOLD_PERCENT && (!impact || impact.verdict !== "positive")) {
    return {
      holding,
      quote,
      unrealizedPnLPercent,
      impact,
      action: "watch",
      reasoning: `含み益が大きく、追加の好材料もないため利益確定を検討するタイミングかもしれません。${pnlText} ${impactText}`,
    };
  }

  return {
    holding,
    quote,
    unrealizedPnLPercent,
    impact,
    action: "hold",
    reasoning: `現時点では明確な売却シグナルはありません。${pnlText} ${impactText}`,
  };
}
