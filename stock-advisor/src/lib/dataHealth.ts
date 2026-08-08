/**
 * Records upstream failures so pages can say "the price feed is down" instead
 * of silently rendering an empty list, which reads identically to "there is
 * nothing to report today".
 *
 * This is a process-wide log rather than a per-request one: a failure recorded
 * by a concurrent request can show up in another page's banner. For a
 * single-user local tool that is the desired behaviour — if Yahoo is down, you
 * want to know regardless of which request noticed — and it avoids threading a
 * context object through every fetcher.
 */

export type DataSource = "prices" | "news" | "social" | "llm";

export interface DataIssue {
  source: DataSource;
  message: string;
  at: number;
  count: number;
}

const SOURCE_LABEL: Record<DataSource, string> = {
  prices: "株価データ(Yahoo Finance)",
  news: "ニュース(Google News)",
  social: "X (Twitter) API",
  llm: "Claude API",
};

/** Keyed by source, so one outage is one banner line rather than fifty. */
const issues = new Map<DataSource, DataIssue>();

/** How long a failure keeps being reported after it last occurred. */
const ISSUE_TTL_MS = 5 * 60_000;

export function recordFailure(source: DataSource, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const existing = issues.get(source);
  issues.set(source, {
    source,
    message,
    at: Date.now(),
    count: existing && Date.now() - existing.at < ISSUE_TTL_MS ? existing.count + 1 : 1,
  });
}

/** Failures seen recently enough to still be worth showing. */
export function recentIssues(now = Date.now()): DataIssue[] {
  const live: DataIssue[] = [];
  for (const [source, issue] of issues) {
    if (now - issue.at > ISSUE_TTL_MS) {
      issues.delete(source);
      continue;
    }
    live.push(issue);
  }
  return live;
}

export function describeIssue(issue: DataIssue): string {
  const times = issue.count > 1 ? `(直近${issue.count}件)` : "";
  return `${SOURCE_LABEL[issue.source]} の取得に失敗しています${times}: ${issue.message}`;
}

/** Test helper. */
export function clearIssues(): void {
  issues.clear();
}
