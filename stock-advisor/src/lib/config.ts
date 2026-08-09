/**
 * Tunables for the external services this app talks to.
 *
 * Google News and Yahoo Finance need no key and no contract, so the only
 * paid dependency is the Claude API. Nothing here should require a plan.
 */

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.warn(`[config] ${name}="${raw}" is not a number, using ${fallback}`);
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, Math.trunc(value)));
  if (clamped !== Math.trunc(value)) {
    console.warn(`[config] ${name}=${value} is outside ${min}–${max}, using ${clamped}`);
  }
  return clamped;
}

/**
 * How many articles to pull per ticker.
 *
 * Rule 1 compares the last 24 hours against the ticker's usual rate, so the
 * feed has to reach back past a single day to give the fallback baseline
 * anything to work with.
 */
export const NEWS_FEED_SIZE = intFromEnv("NEWS_FEED_SIZE", 60, 10, 100);

/**
 * How many tickers are enriched at once. Each one can mean a quote, a news
 * fetch and an LLM call, so an unbounded fan-out over a large watchlist would
 * hit provider rate limits and spike the bill.
 */
export const ENRICH_CONCURRENCY = intFromEnv("ENRICH_CONCURRENCY", 4, 1, 32);
