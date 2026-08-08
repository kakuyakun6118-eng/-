import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { ImpactJudgment, ImpactVerdict, NewsItem } from "./types";
import { THEORY_SYSTEM_PROMPT } from "./theoryPrompt";
import { cacheGet, cacheSet, TTL } from "./cache";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_impact",
  description: "株価への影響度判定結果を報告する",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "number", description: "-100〜100の影響度スコア" },
      verdict: { type: "string", enum: ["positive", "negative", "neutral"] },
      reasoning: { type: "string", description: "日本語での判定理由(2〜3文)" },
    },
    required: ["score", "verdict", "reasoning"],
  },
};

function neutralJudgment(ticker: string, basedOn: NewsItem[], reasoning: string): ImpactJudgment {
  return { ticker, score: 0, verdict: "neutral", reasoning, basedOn };
}

export async function judgeImpact(ticker: string, name: string | undefined, headlines: NewsItem[]): Promise<ImpactJudgment> {
  if (headlines.length === 0) {
    return neutralJudgment(ticker, [], "関連する見出しが見つからなかったため、中立と判定しました。");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return neutralJudgment(ticker, headlines, "ANTHROPIC_API_KEY が未設定のためLLM判定をスキップしました。");
  }

  const headlineList = headlines.map((h, i) => `${i + 1}. ${h.title}`).join("\n");
  const userPrompt = `銘柄: ${name ?? ticker}(${ticker})\n\n直近の見出し:\n${headlineList}\n\nこれらの見出しに基づき、report_impact ツールで判定結果を報告してください。`;

  // Key on the exact headlines so new news re-judges, but a refresh doesn't.
  const digest = createHash("sha256").update(`${MODEL}\n${headlineList}`).digest("hex").slice(0, 16);
  const key = `judgment:${ticker}:${digest}`;

  const hit = cacheGet<ImpactJudgment>(key);
  if (hit) return hit;

  try {
    const resp = await getClient().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: THEORY_SYSTEM_PROMPT,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_impact" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = resp.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      return neutralJudgment(ticker, headlines, "LLM応答からツール呼び出しを取得できませんでした。");
    }
    const input = toolUse.input as { score: number; verdict: ImpactVerdict; reasoning: string };
    const score = Math.max(-100, Math.min(100, Number(input.score) || 0));
    const judgment: ImpactJudgment = { ticker, score, verdict: input.verdict, reasoning: input.reasoning, basedOn: headlines };
    // Only successful judgments are cached — a transient API error must not stick for the full TTL.
    cacheSet(key, judgment, TTL.judgment);
    return judgment;
  } catch (err) {
    console.error(`[llm] impact judgment failed for ${ticker}`, err);
    return neutralJudgment(ticker, headlines, "LLM呼び出しでエラーが発生したため中立と判定しました。");
  }
}
