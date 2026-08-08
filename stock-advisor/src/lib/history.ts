import { promises as fs } from "fs";
import path from "path";
import type { TheoryScore, TheoryVerdict } from "./types";

/**
 * Two records kept over time:
 *
 * - `mentions.json` gives rule 1 a baseline that isn't limited to whatever the
 *   X API happens to return in one call. The 100-post window can cover only a
 *   few days for a chatty account; recorded daily counts accumulate instead.
 * - `snapshots.json` stores each judgment with the price at the time, so a call
 *   can be checked against what the stock actually did afterwards.
 */

const HISTORY_DIR = path.join(process.cwd(), "data", "history");
const MENTIONS_FILE = path.join(HISTORY_DIR, "mentions.json");
const SNAPSHOTS_FILE = path.join(HISTORY_DIR, "snapshots.json");

/** Recorded days needed before the history baseline is trusted over the post window. */
export const MIN_HISTORY_DAYS = 3;

/** date (YYYY-MM-DD, JST) → ticker → mentions counted that day */
export type MentionHistory = Record<string, Record<string, number>>;

export interface Snapshot {
  date: string;
  recordedAt: string;
  ticker: string;
  name?: string;
  mentions24h: number;
  theoryTotal: number;
  theoryVerdict: TheoryVerdict;
  buzzApplies: boolean;
  catalystType: string | null;
  riskType: string | null;
  /** Price when the call was made — the baseline for checking it later. */
  price: number | null;
}

/** The market here is Japanese, so days roll over at JST midnight, not UTC. */
export function jstDateKey(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export async function loadMentionHistory(): Promise<MentionHistory> {
  return readJson<MentionHistory>(MENTIONS_FILE, {});
}

export async function loadSnapshots(): Promise<Snapshot[]> {
  return readJson<Snapshot[]>(SNAPSHOTS_FILE, []);
}

/**
 * Average mentions per recorded day, over the days before `today`.
 *
 * Days the recorder never ran are simply absent — the average is over observed
 * days, not elapsed ones, since nothing is known about the gaps.
 */
export function historicalBaselineDaily(ticker: string, history: MentionHistory, today: string): number | null {
  const days = Object.keys(history).filter((d) => d < today);
  if (days.length < MIN_HISTORY_DAYS) return null;
  const total = days.reduce((sum, d) => sum + (history[d]?.[ticker] ?? 0), 0);
  return total / days.length;
}

/** Merge one day's mention counts, replacing that day's entry (counts are already 24h totals). */
export function mergeMentionCounts(history: MentionHistory, date: string, counts: Record<string, number>): MentionHistory {
  return { ...history, [date]: counts };
}

/** Replace any snapshots already recorded for `date`, so re-running is idempotent. */
export function mergeSnapshots(existing: Snapshot[], date: string, fresh: Snapshot[]): Snapshot[] {
  return [...existing.filter((s) => s.date !== date), ...fresh];
}

export function toSnapshot(score: TheoryScore, date: string, recordedAt: string, price: number | null, name?: string): Snapshot {
  return {
    date,
    recordedAt,
    ticker: score.ticker,
    name,
    mentions24h: score.buzz.mentions24h,
    theoryTotal: score.total,
    theoryVerdict: score.verdict,
    buzzApplies: score.buzz.applies,
    catalystType: score.catalyst.type,
    riskType: score.risk.type,
    price,
  };
}

export interface RecordResult {
  date: string;
  tickersRecorded: number;
  snapshots: Snapshot[];
}

/** Persist today's mention counts and judgment snapshots. Safe to run more than once a day. */
export async function recordDaily(scores: TheoryScore[], prices: Map<string, number>, names: Map<string, string>, now = new Date()): Promise<RecordResult> {
  const date = jstDateKey(now);
  const recordedAt = now.toISOString();

  const counts = Object.fromEntries(scores.map((s) => [s.ticker, s.buzz.mentions24h]));
  const snapshots = scores.map((s) => toSnapshot(s, date, recordedAt, prices.get(s.ticker) ?? null, names.get(s.ticker)));

  const [history, existing] = await Promise.all([loadMentionHistory(), loadSnapshots()]);
  await Promise.all([
    writeJson(MENTIONS_FILE, mergeMentionCounts(history, date, counts)),
    writeJson(SNAPSHOTS_FILE, mergeSnapshots(existing, date, snapshots)),
  ]);

  return { date, tickersRecorded: scores.length, snapshots };
}

export interface SnapshotOutcome extends Snapshot {
  currentPrice: number | null;
  /** Percent change from the price at call time to now; null when either price is missing. */
  returnPercent: number | null;
  daysElapsed: number;
}

export function buildOutcome(snapshot: Snapshot, currentPrice: number | null, now = new Date()): SnapshotOutcome {
  const returnPercent =
    snapshot.price != null && snapshot.price > 0 && currentPrice != null ? ((currentPrice - snapshot.price) / snapshot.price) * 100 : null;
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(snapshot.recordedAt).getTime()) / (24 * 60 * 60 * 1000)));
  return { ...snapshot, currentPrice, returnPercent, daysElapsed };
}

export interface VerdictStats {
  verdict: TheoryVerdict;
  count: number;
  /** Share of calls that went up, among those with a measurable return. */
  hitRate: number | null;
  averageReturnPercent: number | null;
}

/** Group past calls by verdict band so the scorecard can be checked against reality. */
export function summarizeByVerdict(outcomes: SnapshotOutcome[]): VerdictStats[] {
  const bands: TheoryVerdict[] = ["strong", "watch", "neutral", "caution"];
  return bands.map((verdict) => {
    const rows = outcomes.filter((o) => o.theoryVerdict === verdict);
    const measured = rows.filter((o) => o.returnPercent !== null);
    return {
      verdict,
      count: rows.length,
      hitRate: measured.length > 0 ? measured.filter((o) => o.returnPercent! > 0).length / measured.length : null,
      averageReturnPercent: measured.length > 0 ? measured.reduce((s, o) => s + o.returnPercent!, 0) / measured.length : null,
    };
  });
}
