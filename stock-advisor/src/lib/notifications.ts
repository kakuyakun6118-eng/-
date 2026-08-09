import type { HoldingVerdict, Recommendation } from "./types";

export type Severity = "alert" | "info";

export interface Notification {
  ticker: string;
  name?: string;
  severity: Severity;
  title: string;
  lines: string[];
  /** Identifies the condition, so the same alert isn't re-sent every cron tick. */
  dedupeKey: string;
}

/** Risk types that are hard news about the company rather than tone of coverage. */
const MATERIAL_RISKS = new Set(["公募増資", "不祥事"]);

const DISCLAIMER = "※ 投資助言ではありません。売買判断はご自身の責任で行ってください。";

function label(ticker: string, name?: string): string {
  return name ? `${name}(${ticker})` : ticker;
}

/**
 * Build the alerts worth interrupting someone for.
 *
 * Holdings come first: a sell signal or hard bad news on something already
 * owned is actionable now, whereas a new pick can wait. Merely hyped names are
 * deliberately not notified — that's the noise the theory deducts for.
 */
export function buildNotifications(recommendations: Recommendation[], verdicts: HoldingVerdict[]): Notification[] {
  const notifications: Notification[] = [];

  for (const v of verdicts) {
    const name = v.holding.name;
    const ticker = v.holding.ticker;
    const risk = v.theory?.risk;

    if (risk?.applies && MATERIAL_RISKS.has(risk.type ?? "")) {
      notifications.push({
        ticker,
        name,
        severity: "alert",
        title: `⚠ 保有株に「${risk.type}」の報道`,
        lines: [label(ticker, name), v.reasoning],
        dedupeKey: `holding-risk:${ticker}:${risk.type}`,
      });
      continue;
    }

    if (v.action === "sell") {
      notifications.push({
        ticker,
        name,
        severity: "alert",
        title: "⚠ 保有株に売却検討シグナル",
        lines: [label(ticker, name), v.reasoning],
        dedupeKey: `holding-sell:${ticker}`,
      });
    }
  }

  for (const rec of recommendations) {
    if (rec.theory?.verdict !== "strong") continue;
    notifications.push({
      ticker: rec.ticker,
      name: rec.name,
      severity: "info",
      title: `📈 紫蘇の葉理論で有力(+${rec.theory.total}点)`,
      lines: [
        `${label(rec.ticker, rec.name)} 現在値 ${rec.quote.price.toLocaleString()}円(前日比 ${rec.quote.changePercent.toFixed(2)}%)`,
        rec.theory.reasoning,
        ...rec.cautions.map((c) => `⚠ ${c}`),
      ],
      dedupeKey: `pick:${rec.ticker}:${rec.theory.verdict}`,
    });
  }

  // Alerts before picks — the urgent thing should be at the top of the message.
  return notifications.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alert" ? -1 : 1));
}

export function renderMessage(notifications: Notification[]): string {
  const body = notifications.map((n) => [`【${n.title}】`, ...n.lines].join("\n")).join("\n\n");
  return `${body}\n\n${DISCLAIMER}`;
}

/** Split a message so each part stays inside a channel's character limit. */
export function chunkMessage(message: string, limit: number): string[] {
  if (message.length <= limit) return [message];

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of message.split("\n\n")) {
    // A single oversized paragraph has to be cut mid-way; nothing else fits.
    if (paragraph.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < paragraph.length; i += limit) {
        chunks.push(paragraph.slice(i, i + limit));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > limit) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
