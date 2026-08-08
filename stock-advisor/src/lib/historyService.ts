import { loadWatchedActivity } from "./accountActivity";
import { getWatchlist } from "./watchlist";
import { getQuote } from "./prices";
import { buildOutcome, loadSnapshots, recordDaily, summarizeByVerdict, type RecordResult, type SnapshotOutcome, type VerdictStats } from "./history";

/** Capture today's mention counts and judgments, with the price at call time. */
export async function recordToday(): Promise<RecordResult> {
  const [{ scores }, watchlist] = await Promise.all([loadWatchedActivity(), getWatchlist()]);

  const quotes = await Promise.all(scores.map((s) => getQuote(s.ticker)));
  const prices = new Map<string, number>();
  quotes.forEach((q, i) => {
    if (q) prices.set(scores[i].ticker, q.price);
  });

  const names = new Map(watchlist.filter((w) => w.name).map((w) => [w.ticker, w.name!]));

  return recordDaily(scores, prices, names);
}

export interface HistoryView {
  outcomes: SnapshotOutcome[];
  stats: VerdictStats[];
}

/** Past calls paired with what the stock has done since. */
export async function loadHistoryView(): Promise<HistoryView> {
  const snapshots = await loadSnapshots();
  if (snapshots.length === 0) return { outcomes: [], stats: summarizeByVerdict([]) };

  const tickers = [...new Set(snapshots.map((s) => s.ticker))];
  const quotes = await Promise.all(tickers.map((t) => getQuote(t)));
  const current = new Map<string, number>();
  quotes.forEach((q, i) => {
    if (q) current.set(tickers[i], q.price);
  });

  const outcomes = snapshots
    .map((s) => buildOutcome(s, current.get(s.ticker) ?? null))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.theoryTotal - a.theoryTotal);

  return { outcomes, stats: summarizeByVerdict(outcomes) };
}
