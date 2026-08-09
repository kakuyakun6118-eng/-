import type { Holding, HoldingVerdict, ImpactJudgment, PriceQuote, Recommendation, TheoryScore } from "./types";
import { volumeRatio } from "./prices";
import { normalizeTheoryTotal } from "./theory";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function technicalScore(quote: PriceQuote): number {
  const changeComponent = clamp(quote.changePercent * 5, -50, 50);
  const ratio = volumeRatio(quote);
  const volumeComponent = ratio ? clamp((ratio - 1) * 20, 0, 30) : 0;
  return changeComponent + volumeComponent;
}

/** News and price action alone. */
const WEIGHTS = { impact: 0.6, technical: 0.4 } as const;

/**
 * When the theory scorecard has something to say about the stock, it becomes a
 * first-class signal and the other two are scaled back to make room.
 */
const WEIGHTS_WITH_THEORY = { impact: 0.4, technical: 0.25, theory: 0.35 } as const;

/**
 * Hype is exactly the risk the theory deducts for, so it is surfaced on the
 * recommendation rather than being buried inside the score.
 */
function cautionsFor(theory: TheoryScore | null): string[] {
  if (!theory?.risk.applies) return [];
  const label = theory.risk.type ?? "リスク";
  if (label === "過熱・煽り") {
    return ["報道が過熱・煽り基調です。材料の実体より人気が先行している可能性があり、急落に注意してください。"];
  }
  return [`報道に「${label}」に該当する減点要素が含まれます。`];
}

export function buildRecommendation(
  ticker: string,
  name: string | undefined,
  quote: PriceQuote,
  impact: ImpactJudgment,
  theory: TheoryScore | null = null
): Recommendation {
  const technical = technicalScore(quote);

  const combinedScore = theory
    ? Math.round(
        impact.score * WEIGHTS_WITH_THEORY.impact +
          technical * WEIGHTS_WITH_THEORY.technical +
          normalizeTheoryTotal(theory.total) * WEIGHTS_WITH_THEORY.theory
      )
    : Math.round(impact.score * WEIGHTS.impact + technical * WEIGHTS.technical);

  const verdict = combinedScore >= 20 ? "positive" : combinedScore <= -20 ? "negative" : "neutral";

  return { ticker, name, quote, impact, theory, combinedScore, verdict, cautions: cautionsFor(theory) };
}

export function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => b.combinedScore - a.combinedScore);
}

const SELL_ON_BAD_NEWS_THRESHOLD = -40;
const LOSS_CUT_THRESHOLD_PERCENT = -15;
const PROFIT_TAKE_THRESHOLD_PERCENT = 25;

/** Risk types that are hard news about the company, as opposed to tone of voice. */
const MATERIAL_RISKS = new Set(["公募増資", "不祥事"]);

export function buildHoldingVerdict(
  holding: Holding,
  quote: PriceQuote | null,
  impact: ImpactJudgment | null,
  theory: TheoryScore | null = null
): HoldingVerdict {
  const unrealizedPnLPercent = quote ? ((quote.price - holding.costBasis) / holding.costBasis) * 100 : null;
  const pnlText = unrealizedPnLPercent !== null ? `含み損益 ${unrealizedPnLPercent.toFixed(1)}%。` : "現在値を取得できませんでした。";
  const impactText = impact ? impact.reasoning : "ニュース材料は未取得です。";
  const theoryText = theory ? `理論スコア: ${theory.reasoning}` : "";

  const base = { holding, quote, unrealizedPnLPercent, impact, theory };
  const say = (...parts: string[]) => parts.filter(Boolean).join(" ");

  // Reported dilution or misconduct on something you hold is a concrete
  // negative, so it outranks the price-based rules below.
  if (theory?.risk.applies && MATERIAL_RISKS.has(theory.risk.type ?? "")) {
    return {
      ...base,
      action: "sell",
      reasoning: say(`「${theory.risk.type}」に該当する報道があります。売却を検討する余地があります。`, pnlText, theoryText),
    };
  }

  if (impact && impact.verdict === "negative" && impact.score <= SELL_ON_BAD_NEWS_THRESHOLD) {
    return { ...base, action: "sell", reasoning: say("悪材料の影響度が大きいため売却を検討する余地があります。", pnlText, impactText, theoryText) };
  }

  // Hype without substance is a reason to watch a position, not to add to it.
  if (theory?.verdict === "caution") {
    return {
      ...base,
      action: "watch",
      reasoning: say("報道に減点要素があり、過熱による急変に注意が必要です。", pnlText, theoryText),
    };
  }

  const theoryIsPositive = theory ? theory.total > 0 : false;
  const newsIsPositive = impact?.verdict === "positive";
  const hasTailwind = newsIsPositive || theoryIsPositive;

  if (unrealizedPnLPercent !== null && unrealizedPnLPercent <= LOSS_CUT_THRESHOLD_PERCENT && !hasTailwind) {
    return { ...base, action: "sell", reasoning: say("含み損が大きく、好材料も見当たらないため損切りを検討する水準です。", pnlText, impactText, theoryText) };
  }

  if (unrealizedPnLPercent !== null && unrealizedPnLPercent >= PROFIT_TAKE_THRESHOLD_PERCENT && !hasTailwind) {
    return {
      ...base,
      action: "watch",
      reasoning: say("含み益が大きく、追加の好材料もないため利益確定を検討するタイミングかもしれません。", pnlText, impactText, theoryText),
    };
  }

  return { ...base, action: "hold", reasoning: say("現時点では明確な売却シグナルはありません。", pnlText, impactText, theoryText) };
}
