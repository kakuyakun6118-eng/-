import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { BuzzSurge, ContentAssessment, NewsItem, TheoryScore, TheoryVerdict } from "./types";
import { THEORY_SYSTEM_PROMPT } from "./theoryPrompt";
import { cacheGet, cacheSet, TTL } from "./cache";
import { recordFailure } from "./dataHealth";

/** Point values, straight from the scorecard. */
export const POINTS = {
  buzzSurge: 30,
  positiveCatalyst: 40,
  risk: -30,
} as const;

/** Rule 1's threshold: 24h coverage must be at least this many times the baseline. */
export const SURGE_MULTIPLIER = 3;

/**
 * A surge needs this many articles in 24h regardless of the ratio.
 *
 * Thinly covered stocks sit at a fraction of an article per day, so a single
 * routine piece clears "3x" on its own. The absolute floor stops one article
 * from scoring the full +30, and also covers the case where the baseline is
 * zero and the ratio is undefined.
 */
export const MIN_ARTICLES_FOR_SURGE = 2;

/** Baseline needs at least this much history behind the 24h window to mean anything. */
export const MIN_BASELINE_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function publishedAt(item: NewsItem): number | null {
  if (!item.pubDate) return null;
  const t = new Date(item.pubDate).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Rule 1: 話題性の急上昇 (+30).
 *
 * Counts articles about `ticker` in the last 24 hours and compares them
 * against the stock's usual rate of coverage. This is measured, not guessed.
 *
 * `historyBaselineDaily` is the long-run rate from recorded daily counts. When
 * available it wins over the figure derived from the fetched feed, which only
 * reaches as far back as one request returns.
 */
export function computeBuzzSurge(
  ticker: string,
  articles: NewsItem[],
  now: Date = new Date(),
  historyBaselineDaily: number | null = null
): BuzzSurge {
  const cutoff = now.getTime() - DAY_MS;

  const dated = articles.map((a) => ({ item: a, at: publishedAt(a) })).filter((a): a is { item: NewsItem; at: number } => a.at !== null);
  const recent = dated.filter((a) => a.at > cutoff);
  const older = dated.filter((a) => a.at <= cutoff);

  const miss = (detail: string): BuzzSurge => ({
    applies: false,
    points: 0,
    articles24h: recent.length,
    baselineDaily: null,
    ratio: null,
    baselineSource: null,
    detail,
  });

  if (dated.length === 0) return miss("日付付きの記事を取得できていないため、話題性は判定できません。");

  let baselineDaily: number;
  let baselineSource: "history" | "feed";

  if (historyBaselineDaily !== null) {
    baselineDaily = historyBaselineDaily;
    baselineSource = "history";
  } else {
    // How far back the fetched feed reaches decides whether a baseline exists.
    const feedStart = Math.min(...dated.map((a) => a.at));
    const baselineDays = (cutoff - feedStart) / DAY_MS;

    if (baselineDays < MIN_BASELINE_DAYS) {
      return miss(`比較対象となる過去の記事が${MIN_BASELINE_DAYS}日分に満たないため、話題性の急上昇は判定できません(直近24時間の記事${recent.length}件)。`);
    }
    baselineDaily = older.length / baselineDays;
    baselineSource = "feed";
  }

  const sourceNote = baselineSource === "history" ? "記録済みの日次履歴" : "取得したニュースフィード";

  const enoughArticles = recent.length >= MIN_ARTICLES_FOR_SURGE;

  if (baselineDaily === 0) {
    return {
      applies: enoughArticles,
      points: enoughArticles ? POINTS.buzzSurge : 0,
      articles24h: recent.length,
      baselineDaily: 0,
      ratio: null,
      baselineSource,
      detail: enoughArticles
        ? `これまで報道のなかった銘柄が直近24時間で${recent.length}件報じられました(新規の話題。基準: ${sourceNote})。`
        : `過去の報道がなく、直近24時間の記事も${recent.length}件のみのため、急上昇とは判定しませんでした(${MIN_ARTICLES_FOR_SURGE}件以上で該当)。`,
    };
  }

  const ratio = recent.length / baselineDaily;
  const applies = ratio >= SURGE_MULTIPLIER && enoughArticles;

  const why = applies
    ? `${SURGE_MULTIPLIER}倍以上のため該当します。`
    : ratio < SURGE_MULTIPLIER
      ? `${SURGE_MULTIPLIER}倍に届かないため該当しません。`
      : `${SURGE_MULTIPLIER}倍を超えていますが、記事が${MIN_ARTICLES_FOR_SURGE}件に満たないため該当としません(普段の報道が少ない銘柄では1件でも倍率が跳ね上がるため)。`;

  return {
    applies,
    points: applies ? POINTS.buzzSurge : 0,
    articles24h: recent.length,
    baselineDaily,
    ratio,
    baselineSource,
    detail: `直近24時間の記事${recent.length}件に対し、通常は1日あたり約${baselineDaily.toFixed(1)}件(${ratio.toFixed(1)}倍、基準: ${sourceNote})。${why}`,
  };
}

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "report_content_assessment",
  description: "ニュース内容の好材料判定とリスク判定の結果を報告する",
  input_schema: {
    type: "object",
    properties: {
      positiveCatalyst: { type: "boolean", description: "具体的な好材料に基づいているか" },
      catalystType: {
        type: ["string", "null"],
        enum: ["業績予想の上方修正", "新技術・新サービス", "好決算", "その他", null],
      },
      riskFlag: { type: "boolean", description: "過熱・煽り、公募増資、不祥事などの減点要素があるか" },
      riskType: {
        type: ["string", "null"],
        enum: ["過熱・煽り", "公募増資", "不祥事", "その他", null],
      },
      reasoning: { type: "string", description: "日本語での判定理由(2〜3文)" },
    },
    required: ["positiveCatalyst", "catalystType", "riskFlag", "riskType", "reasoning"],
  },
};

const UNJUDGED: ContentAssessment = {
  positiveCatalyst: false,
  catalystType: null,
  riskFlag: false,
  riskType: null,
  reasoning: "",
};

let client: Anthropic | null = null;
function getClient(apiKey: string): Anthropic {
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/** Rules 2 and 3: read the headlines and decide whether they carry a real catalyst and/or a risk flag. */
export async function assessContent(ticker: string, headlines: NewsItem[]): Promise<ContentAssessment> {
  if (headlines.length === 0) {
    return { ...UNJUDGED, reasoning: "この銘柄のニュースが見つからなかったため、内容判定は行いませんでした。" };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...UNJUDGED, reasoning: "ANTHROPIC_API_KEY が未設定のため、内容判定(ポジティブ感・リスク)をスキップしました。" };
  }

  const list = headlines.map((h, i) => `${i + 1}. ${h.title}`).join("\n");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const digest = createHash("sha256").update(`${model}\n${list}`).digest("hex").slice(0, 16);
  const key = `theory:${ticker}:${digest}`;

  const hit = cacheGet<ContentAssessment>(key);
  if (hit) return hit;

  try {
    const resp = await getClient(apiKey).messages.create({
      model,
      max_tokens: 512,
      system: THEORY_SYSTEM_PROMPT,
      tools: [ASSESSMENT_TOOL],
      tool_choice: { type: "tool", name: "report_content_assessment" },
      messages: [
        {
          role: "user",
          content: `銘柄コード: ${ticker}\n\n直近のニュース見出し:\n${list}\n\nこれらについて report_content_assessment ツールで判定を報告してください。`,
        },
      ],
    });

    const toolUse = resp.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      return { ...UNJUDGED, reasoning: "LLM応答からツール呼び出しを取得できませんでした。" };
    }
    const assessment = toolUse.input as ContentAssessment;
    // Only successful assessments are cached, so a transient error is retried.
    cacheSet(key, assessment, TTL.judgment);
    return assessment;
  } catch (err) {
    console.error(`[theory] content assessment failed for ${ticker}`, err);
    recordFailure("llm", err);
    return { ...UNJUDGED, reasoning: "LLM呼び出しでエラーが発生したため、内容判定を行えませんでした。" };
  }
}

/** The scorecard's bounds: -30 (risk only) to +70 (surge plus catalyst, no risk). */
export const THEORY_MAX = POINTS.buzzSurge + POINTS.positiveCatalyst;
export const THEORY_MIN = POINTS.risk;

/**
 * Rescale a scorecard total onto the -100..100 range the other signals use,
 * so it can be blended with the news impact score. The two halves are scaled
 * separately because the scorecard is asymmetric (-30 down, +70 up).
 */
export function normalizeTheoryTotal(total: number): number {
  if (total < 0) return Math.max(-100, (total / Math.abs(THEORY_MIN)) * 100);
  return Math.min(100, (total / THEORY_MAX) * 100);
}

/**
 * Map the scorecard onto a verdict band.
 *
 * The total alone is ambiguous: "surge + catalyst - risk" and "catalyst only"
 * both come to 40, but the first is a hyped name and the second is a quiet one
 * with real news. So a standing risk flag caps the verdict at 注目 — nothing
 * carrying 過熱・煽り, 公募増資 or 不祥事 is ever presented as 有力.
 */
export function verdictFor(total: number, riskApplies = false): TheoryVerdict {
  if (total < 0) return "caution";
  if (riskApplies) return total >= 10 ? "watch" : "neutral";
  if (total >= 40) return "strong";
  if (total >= 10) return "watch";
  return "neutral";
}

/** Combine rule 1 (counted) with rules 2 and 3 (judged) into the final scorecard. */
export function combineScore(ticker: string, buzz: BuzzSurge, content: ContentAssessment): TheoryScore {
  const catalyst = {
    applies: content.positiveCatalyst,
    points: content.positiveCatalyst ? POINTS.positiveCatalyst : 0,
    type: content.catalystType,
  };
  const risk = {
    applies: content.riskFlag,
    points: content.riskFlag ? POINTS.risk : 0,
    type: content.riskType,
  };
  const total = buzz.points + catalyst.points + risk.points;

  return {
    ticker,
    buzz,
    catalyst,
    risk,
    total,
    verdict: verdictFor(total, risk.applies),
    reasoning: [buzz.detail, content.reasoning].filter(Boolean).join(" "),
  };
}

export async function scoreTicker(
  ticker: string,
  feed: NewsItem[],
  now?: Date,
  historyBaselineDaily: number | null = null
): Promise<TheoryScore> {
  const buzz = computeBuzzSurge(ticker, feed, now, historyBaselineDaily);
  const content = await assessContent(ticker, feed.slice(0, 8));
  return combineScore(ticker, buzz, content);
}
