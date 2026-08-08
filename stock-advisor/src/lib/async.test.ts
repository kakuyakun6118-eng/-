import { describe, it, expect, vi } from "vitest";
import { withLock, mapWithConcurrency } from "./async";

describe("withLock", () => {
  it("runs work for one key strictly in order", async () => {
    const order: number[] = [];
    const task = (n: number, delay: number) =>
      withLock("k", async () => {
        await new Promise((r) => setTimeout(r, delay));
        order.push(n);
      });

    // The slow one is queued first; without the lock it would finish last.
    await Promise.all([task(1, 20), task(2, 1), task(3, 1)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("prevents a read-modify-write from losing an update", async () => {
    let store: number[] = [];
    const append = (n: number) =>
      withLock("store", async () => {
        const current = store;
        await new Promise((r) => setTimeout(r, 5)); // read/write gap
        store = [...current, n];
      });

    await Promise.all([append(1), append(2), append(3)]);
    expect(store.sort()).toEqual([1, 2, 3]);
  });

  it("lets different keys proceed independently", async () => {
    const started: string[] = [];
    await Promise.all([
      withLock("a", async () => {
        started.push("a");
        await new Promise((r) => setTimeout(r, 10));
      }),
      withLock("b", async () => {
        started.push("b");
      }),
    ]);
    expect(started).toContain("a");
    expect(started).toContain("b");
  });

  it("propagates the caller's error", async () => {
    await expect(withLock("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });

  it("keeps serving the queue after a failure", async () => {
    await expect(withLock("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow();
    await expect(withLock("k", async () => "ok")).resolves.toBe("ok");
  });
});

describe("mapWithConcurrency", () => {
  it("returns results in input order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8]);
  });

  it("never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("actually runs work in parallel up to the limit", async () => {
    let peak = 0;
    let running = 0;
    await mapWithConcurrency([1, 2, 3, 4], 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(4);
  });

  it("handles an empty list", async () => {
    const fn = vi.fn();
    expect(await mapWithConcurrency([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes the index through", async () => {
    expect(await mapWithConcurrency(["a", "b"], 2, async (v, i) => `${i}:${v}`)).toEqual(["0:a", "1:b"]);
  });

  it("treats a limit below one as one", async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });

  it("rejects when any item rejects", async () => {
    await expect(mapWithConcurrency([1, 2], 2, async (n) => { if (n === 2) throw new Error("boom"); return n; })).rejects.toThrow("boom");
  });
});
