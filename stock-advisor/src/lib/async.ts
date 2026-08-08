/** Small async utilities shared by the data loaders. */

/**
 * Serialises work per key within this process.
 *
 * The JSON stores are read-modify-write, so two overlapping requests could
 * otherwise both read the old list and the second write would drop the first
 * one's change.
 */
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // Swallow the predecessor's rejection so one failure doesn't poison the queue.
  const result = previous.catch(() => {}).then(fn);
  chains.set(
    key,
    result.catch(() => {})
  );
  return result;
}

/**
 * Like `Promise.all(items.map(fn))` but with at most `limit` running at once.
 *
 * A watchlist of fifty tickers would otherwise open fifty simultaneous LLM
 * calls, which invites rate limiting and a sudden bill. Results keep the input
 * order.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const bound = Math.max(1, Math.trunc(limit));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(bound, items.length) }, worker));
  return results;
}
