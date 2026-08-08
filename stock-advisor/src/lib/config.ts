/**
 * Tunables that decide how much paid API quota this app consumes.
 *
 * X bills by posts retrieved, so `X_POST_WINDOW × fetches per month` is the
 * number that matters — see the README for the arithmetic. The defaults are
 * sized to sit inside a Basic plan; raise them only if your plan allows.
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
 * Posts fetched per watched account per request.
 *
 * Rule 1 only counts the last 24 hours, and the long-run baseline now comes
 * from the recorded daily history, so a big window is no longer needed. The
 * X API's own maximum is 100.
 */
export const X_POST_WINDOW = intFromEnv("X_POST_WINDOW", 25, 5, 100);

/** How long a fetched timeline is reused before hitting X again. */
export const X_FETCH_TTL_MS = intFromEnv("X_FETCH_TTL_MINUTES", 60, 1, 24 * 60) * 60_000;

/**
 * How many tickers are enriched at once. Each one can mean a quote, a news
 * fetch and an LLM call, so an unbounded fan-out over a large watchlist would
 * hit provider rate limits and spike the bill.
 */
export const ENRICH_CONCURRENCY = intFromEnv("ENRICH_CONCURRENCY", 4, 1, 32);
