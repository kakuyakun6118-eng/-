/**
 * Small in-memory TTL cache.
 *
 * Without this, one page load fans out into a quote fetch, a news fetch and an
 * LLM call per watched ticker — so a refresh costs real money and several
 * seconds. Entries are per-process and vanish on restart, which is fine for a
 * single-user local tool; swap in Redis if this ever runs multi-instance.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** In-flight promises, so N concurrent callers for one key share a single fetch. */
const inFlight = new Map<string, Promise<unknown>>();

export const TTL = {
  /** Prices move constantly, but a minute of staleness is acceptable here. */
  quote: 60_000,
  /** Headlines change slowly. */
  news: 15 * 60_000,
  /** LLM judgments are the expensive ones — cache them hardest. */
  judgment: 30 * 60_000,
  /** X API has tight rate limits on the free/basic tiers. */
  social: 10 * 60_000,
} as const;

/** Returns the live entry, or undefined if absent/expired. Lets callers distinguish a cached `undefined` from a miss. */
function liveEntry<T>(key: string): Entry<T> | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry as Entry<T>;
}

export function cacheGet<T>(key: string): T | undefined {
  return liveEntry<T>(key)?.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Return the cached value for `key`, otherwise run `fn` and cache its result.
 * Concurrent calls for the same key share one execution.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = liveEntry<T>(key);
  if (hit) return hit.value;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Test helper — drops every entry. */
export function cacheClear(): void {
  store.clear();
  inFlight.clear();
}
