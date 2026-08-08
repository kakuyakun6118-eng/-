import YahooFinance from "yahoo-finance2";
import { cached, TTL } from "./cache";
import { recordFailure } from "./dataHealth";

const yahooFinance = new YahooFinance();

export interface DailyClose {
  date: string; // YYYY-MM-DD
  /** Split- and dividend-adjusted close. Raw closes break across a split. */
  adjClose: number;
}

/**
 * Daily adjusted closes from `from` to today.
 *
 * Verification has to use adjusted prices: after a 1:3 split the raw price
 * drops to a third, which would otherwise read as a 67% loss on every call
 * made before it.
 */
export async function getDailyCloses(ticker: string, from: Date): Promise<DailyClose[]> {
  const key = `chart:${ticker}:${from.toISOString().slice(0, 10)}`;
  return cached(key, TTL.quote, async () => {
    try {
      const result = await yahooFinance.chart(ticker, { period1: from, interval: "1d" });
      return (result.quotes ?? [])
        .filter((q) => q.adjclose != null || q.close != null)
        .map((q) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          adjClose: (q.adjclose ?? q.close) as number,
        }));
    } catch (err) {
      console.error(`[priceHistory] failed to fetch chart for ${ticker}`, err);
      recordFailure("prices", err);
      return [];
    }
  });
}

/** The first close on or after `date`; null when the series doesn't reach it. */
export function closeOnOrAfter(series: DailyClose[], date: string): DailyClose | null {
  return series.find((d) => d.date >= date) ?? null;
}

/**
 * The close `tradingDays` sessions after `date`. Counting sessions rather than
 * calendar days keeps weekends and holidays from shifting the horizon.
 */
export function closeAfterTradingDays(series: DailyClose[], date: string, tradingDays: number): DailyClose | null {
  const startIndex = series.findIndex((d) => d.date >= date);
  if (startIndex === -1) return null;
  const target = startIndex + tradingDays;
  return target < series.length ? series[target] : null;
}

export function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}
