import { loadWatchedActivity } from "./accountActivity";
import { getWatchlist } from "./watchlist";
import { getQuote } from "./prices";
import { closeAfterTradingDays, closeOnOrAfter, getDailyCloses, percentChange, type DailyClose } from "./priceHistory";
import { mapWithConcurrency } from "./async";
import { ENRICH_CONCURRENCY } from "./config";
import {
  HORIZONS,
  loadSnapshots,
  recordDaily,
  summarizeByVerdict,
  type Horizon,
  type RecordResult,
  type Snapshot,
  type SnapshotOutcome,
  type VerdictStats,
} from "./history";

/** Capture today's mention counts and judgments, with the price at call time. */
export async function recordToday(): Promise<RecordResult> {
  const [{ scores }, watchlist] = await Promise.all([loadWatchedActivity(), getWatchlist()]);

  const quotes = await mapWithConcurrency(scores, ENRICH_CONCURRENCY, (s) => getQuote(s.ticker));
  const prices = new Map<string, number>();
  quotes.forEach((q, i) => {
    if (q) prices.set(scores[i].ticker, q.price);
  });

  const names = new Map(watchlist.filter((w) => w.name).map((w) => [w.ticker, w.name!]));

  return recordDaily(scores, prices, names);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildOutcomeFromSeries(snapshot: Snapshot, series: DailyClose[], now: Date): SnapshotOutcome {
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(snapshot.recordedAt).getTime()) / DAY_MS));
  const base = closeOnOrAfter(series, snapshot.date);
  const latest = series.length > 0 ? series[series.length - 1] : null;

  const emptyHorizons = Object.fromEntries(HORIZONS.map((h) => [h, null])) as Record<Horizon, number | null>;

  if (!base || !latest) {
    return {
      ...snapshot,
      basePrice: null,
      currentPrice: null,
      currentReturnPercent: null,
      horizonReturns: emptyHorizons,
      daysElapsed,
      measured: false,
    };
  }

  const horizonReturns = Object.fromEntries(
    HORIZONS.map((h) => {
      const at = closeAfterTradingDays(series, snapshot.date, h);
      return [h, at ? percentChange(base.adjClose, at.adjClose) : null];
    })
  ) as Record<Horizon, number | null>;

  return {
    ...snapshot,
    basePrice: base.adjClose,
    currentPrice: latest.adjClose,
    currentReturnPercent: percentChange(base.adjClose, latest.adjClose),
    horizonReturns,
    daysElapsed,
    measured: true,
  };
}

export interface HistoryView {
  outcomes: SnapshotOutcome[];
  stats: VerdictStats[];
}

/** Past calls paired with what the stock did over each fixed holding period. */
export async function loadHistoryView(): Promise<HistoryView> {
  const snapshots = await loadSnapshots();
  if (snapshots.length === 0) return { outcomes: [], stats: summarizeByVerdict([]) };

  // One adjusted series per ticker, starting from its earliest recorded call.
  const earliest = new Map<string, string>();
  for (const s of snapshots) {
    const current = earliest.get(s.ticker);
    if (!current || s.date < current) earliest.set(s.ticker, s.date);
  }

  const tickers = [...earliest.keys()];
  const seriesList = await mapWithConcurrency(tickers, ENRICH_CONCURRENCY, (ticker) =>
    getDailyCloses(ticker, new Date(`${earliest.get(ticker)}T00:00:00Z`))
  );
  const seriesByTicker = new Map(tickers.map((t, i) => [t, seriesList[i]]));

  const now = new Date();
  const outcomes = snapshots
    .map((s) => buildOutcomeFromSeries(s, seriesByTicker.get(s.ticker) ?? [], now))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.theoryTotal - a.theoryTotal);

  return { outcomes, stats: summarizeByVerdict(outcomes) };
}
