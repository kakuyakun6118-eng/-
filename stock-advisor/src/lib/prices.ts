import YahooFinance from "yahoo-finance2";
import type { PriceQuote } from "./types";
import { cached, TTL } from "./cache";

const yahooFinance = new YahooFinance();

export async function getQuote(ticker: string): Promise<PriceQuote | null> {
  return cached(`quote:${ticker}`, TTL.quote, async () => {
    try {
      const q = await yahooFinance.quote(ticker);
      if (!q || q.regularMarketPrice == null) return null;
      return {
        ticker,
        price: q.regularMarketPrice,
        previousClose: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume ?? 0,
        avgVolume10d: q.averageDailyVolume10Day ?? null,
        currency: q.currency ?? "JPY",
        marketTime: q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : null,
      };
    } catch (err) {
      console.error(`[prices] failed to fetch quote for ${ticker}`, err);
      return null;
    }
  });
}

export async function getQuotes(tickers: string[]): Promise<Map<string, PriceQuote>> {
  const results = await Promise.all(tickers.map((t) => getQuote(t)));
  const map = new Map<string, PriceQuote>();
  results.forEach((q, i) => {
    if (q) map.set(tickers[i], q);
  });
  return map;
}

/** volume vs its own 10-day average; >1 means today is running hot */
export function volumeRatio(quote: PriceQuote): number | null {
  if (!quote.avgVolume10d || quote.avgVolume10d <= 0) return null;
  return quote.volume / quote.avgVolume10d;
}
