import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { BuzzSurge, ContentAssessment, TheoryScore, TheoryVerdict } from "./types";
import type { SocialPost } from "./socialSource";
import { THEORY_SYSTEM_PROMPT } from "./theoryPrompt";
import { cacheGet, cacheSet, TTL } from "./cache";

/** Point values, straight from the scorecard. */
export const POINTS = {
  buzzSurge: 30,
  positiveCatalyst: 40,
  risk: -30,
} as const;

/** Rule 1's threshold: 24h mentions must be at least this many times the baseline. */
export const SURGE_MULTIPLIER = 3;

/**
 * With no prior mentions the "3x" ratio is undefined, so a brand-new topic
 * needs at least this many mentions in 24h to count as a surge. Without the
 * floor, one stray post would score the full +30.
 */
export const MIN_MENTIONS_WITHOUT_BASELINE = 2;

/** Baseline needs at least this much history behind the 24h window to mean anything. */
export const MIN_BASELINE_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function mentionsOf(ticker: string, posts: SocialPost[]): SocialPost[] {
  return posts.filter((p) => p.tickers.includes(ticker));
}

/**
 * Rule 1: 話題性の急上昇 (+30).
 *
 * Counts the watched accounts' mentions of `ticker` in the last 24 hours and
 * compares them against their own earlier rate. This is measured, not guessed.
 *
 * `historyBaselineDaily` is the long-run rate from recorded daily counts. When
 * available it wins over the figure derived from the fetched post window, which
 * can only reach as far back as one API call returns.
 */
export function computeBuzzSurge(
  ticker: string,
  posts: SocialPost[],
  now: Date = new Date(),
  historyBaselineDaily: number | null = null
): BuzzSurge {
  const nowMs = now.getTime();
  const cutoff = nowMs - DAY_MS;

  const mentions = mentionsOf(ticker, posts);
  const recent = mentions.filter((p) => new Date(p.createdAt).getTime() > cutoff);
  const older = mentions.filter((p) => new Date(p.createdAt).getTime() <= cutoff);

  const miss = (detail: string): BuzzSurge => ({
    applies: false,
    points: 0,
    mentions24h: recent.length,
    baselineDaily: null,
    ratio: null,
    baselineSource: null,
    detail,
  });

  if (posts.length === 0) return miss("投稿を取得できていないため、話題性は判定できません。");

  let baselineDaily: number;
  let baselineSource: "history" | "window";

  if (historyBaselineDaily !== null) {
    baselineDaily = historyBaselineDaily;
    baselineSource = "history";
  } else {
    // How far back the fetched window reaches decides whether a baseline exists.
    const windowStart = Math.min(...posts.map((p) => new Date(p.createdAt).getTime()));
    const baselineDays = (cutoff - windowStart) / DAY_MS;

    if (baselineDays < MIN_BASELINE_DAYS) {
      return miss(
        `比較対象となる過去の投稿履歴が${MIN_BASELINE_DAYS}日分に満たないため、話題性の急上昇は判定できません(直近24時間の言及${recent.length}件)。`
      );
    }
    baselineDaily = older.length / baselineDays;
    baselineSource = "window";
  }

  const sourceNote = baselineSource === "history" ? "記録済みの日次履歴" : "取得した投稿ウィンドウ";

  if (baselineDaily === 0) {
    const applies = recent.length >= MIN_MENTIONS_WITHOUT_BASELINE;
    return {
      applies,
      points: applies ? POINTS.buzzSurge : 0,
      mentions24h: recent.length,
      baselineDaily: 0,
      ratio: null,
      baselineSource,
      detail: applies
        ? `これまで言及のなかった銘柄が直近24時間で${recent.length}件言及されました(新規の話題。基準: ${sourceNote})。`
        : `過去の言及がなく、直近24時間の言及も${recent.length}件のみのため、急上昇とは判定しませんでした(${MIN_MENTIONS_WITHOUT_BASELINE}件以上で該当)。`,
    };
  }

  const ratio = recent.length / baselineDaily;
  const applies = ratio >= SURGE_MULTIPLIER;

  return {
    applies,
    points: applies ? POINTS.buzzSurge : 0,
    mentions24h: recent.length,
    baselineDaily,
    ratio,
    baselineSource,
    detail: `直近24時間の言及${recent.length}件に対し、通常は1日あたり約${baselineDaily.toFixed(1)}件(${ratio.toFixed(1)}倍、基準: ${sourceNote})。${
      applies ? `${SURGE_MULTIPLIER}倍以上のため該当します。` : `${SURGE_MULTIPLIER}倍に届かないため該当しません。`
    }`,
  };
}

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "report_content_assessment",
  description: "投稿内容の好材料判定とリスク判定の結果を報告する",
  input_schema: {
    type: "object",
    properties: {
      positiveCatalyst: { type: "boolean", description: "具体的な好材料に基づいているか" },
      catalystType: {
        type: ["string", "null"],
        enum: ["業績予想の上方修正", "新技術・新サービス", "好決算", "その他", null],
      },
      riskFlag: { type: "boolean", description: "イナゴ集め・公募増資・不祥事などの減点要素があるか" },
      riskType: {
        type: ["string", "null"],
        enum: ["イナゴ集め", "公募増資", "不祥事", "その他", null],
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

/** Rules 2 and 3: read the posts and decide whether they carry a real catalyst and/or a risk flag. */
export async function assessContent(ticker: string, posts: SocialPost[]): Promise<ContentAssessment> {
  const mentions = mentionsOf(ticker, posts);
  if (mentions.length === 0) {
    return { ...UNJUDGED, reasoning: "この銘柄への言及が見つからなかったため、内容判定は行いませんでした。" };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...UNJUDGED, reasoning: "ANTHROPIC_API_KEY が未設定のため、内容判定(ポジティブ感・リスク)をスキップしました。" };
  }

  const postList = mentions.map((p, i) => `${i + 1}. [@${p.handle} / ${p.createdAt}] ${p.text}`).join("\n");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const digest = createHash("sha256").update(`${model}\n${postList}`).digest("hex").slice(0, 16);
  const key = `theory:${ticker}:${digest}`;

  const hit = cacheGet<ContentAssessment>(key);
  if (hit) return hit;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model,
      max_tokens: 512,
      system: THEORY_SYSTEM_PROMPT,
      tools: [ASSESSMENT_TOOL],
      tool_choice: { type: "tool", name: "report_content_assessment" },
      messages: [
        {
          role: "user",
          content: `銘柄コード: ${ticker}\n\n監視アカウントによる該当銘柄への言及:\n${postList}\n\nこれらの投稿について report_content_assessment ツールで判定を報告してください。`,
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

/** Map the scorecard total onto a verdict band. Possible totals are -30, 0, 10, 30, 40 and 70. */
export function verdictFor(total: number): TheoryVerdict {
  if (total >= 40) return "strong";
  if (total >= 10) return "watch";
  if (total >= 0) return "neutral";
  return "caution";
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
    verdict: verdictFor(total),
    reasoning: [buzz.detail, content.reasoning].filter(Boolean).join(" "),
  };
}

export async function scoreTicker(
  ticker: string,
  posts: SocialPost[],
  now?: Date,
  historyBaselineDaily: number | null = null
): Promise<TheoryScore> {
  const buzz = computeBuzzSurge(ticker, posts, now, historyBaselineDaily);
  const content = await assessContent(ticker, posts);
  return combineScore(ticker, buzz, content);
}
