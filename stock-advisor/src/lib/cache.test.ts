import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cached, cacheGet, cacheSet, cacheClear, cacheSize, MAX_ENTRIES, TTL } from "./cache";

beforeEach(() => cacheClear());
afterEach(() => vi.useRealTimers());

describe("cacheGet / cacheSet", () => {
  it("returns a stored value", () => {
    cacheSet("k", 42, 1000);
    expect(cacheGet<number>("k")).toBe(42);
  });

  it("returns undefined for an unknown key", () => {
    expect(cacheGet("missing")).toBeUndefined();
  });

  it("expires a value once its TTL has elapsed", () => {
    vi.useFakeTimers();
    cacheSet("k", 42, 1000);
    vi.advanceTimersByTime(1001);
    expect(cacheGet("k")).toBeUndefined();
  });
});

describe("cached", () => {
  it("runs the function on a miss and reuses the result on a hit", async () => {
    const fn = vi.fn().mockResolvedValue("value");
    expect(await cached("k", 1000, fn)).toBe("value");
    expect(await cached("k", 1000, fn)).toBe("value");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-runs the function after expiry", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue("value");
    await cached("k", 1000, fn);
    vi.advanceTimersByTime(1001);
    await cached("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caches a null result, so failed lookups are not retried every call", async () => {
    const fn = vi.fn().mockResolvedValue(null);
    expect(await cached("k", 1000, fn)).toBeNull();
    expect(await cached("k", 1000, fn)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caches an undefined result without treating it as a miss", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await cached("k", 1000, fn);
    await cached("k", 1000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shares one execution between concurrent callers", async () => {
    let resolve!: (v: string) => void;
    const fn = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const both = Promise.all([cached("k", 1000, fn), cached("k", 1000, fn)]);
    resolve("value");
    expect(await both).toEqual(["value", "value"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps separate keys independent", async () => {
    await cached("a", 1000, async () => "A");
    await cached("b", 1000, async () => "B");
    expect(cacheGet("a")).toBe("A");
    expect(cacheGet("b")).toBe("B");
  });

  it("lets a rejected call be retried instead of caching the failure", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    await expect(cached("k", 1000, fn)).rejects.toThrow("boom");
    expect(await cached("k", 1000, fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("TTL presets", () => {
  it("caches LLM judgments longer than quotes, since they cost the most", () => {
    expect(TTL.judgment).toBeGreaterThan(TTL.quote);
  });
});

describe("eviction", () => {
  it("keeps the store bounded as new keys keep arriving", () => {
    // Judgment keys are hash-based, so they accumulate without a bound.
    for (let i = 0; i < MAX_ENTRIES + 500; i++) {
      cacheSet(`judgment:${i}`, i, 60_000);
    }
    expect(cacheSize()).toBeLessThanOrEqual(MAX_ENTRIES);
  });

  it("drops expired entries before evicting live ones", () => {
    vi.useFakeTimers();
    cacheSet("short", 1, 1000);
    vi.advanceTimersByTime(2000);
    for (let i = 0; i < MAX_ENTRIES; i++) cacheSet(`k${i}`, i, 600_000);
    expect(cacheGet("short")).toBeUndefined();
    expect(cacheGet("k0")).toBe(0);
  });

  it("evicts the soonest-to-expire entries first", () => {
    cacheSet("long-lived", "keep", 3_600_000);
    for (let i = 0; i < MAX_ENTRIES + 200; i++) cacheSet(`k${i}`, i, 60_000);
    expect(cacheGet("long-lived")).toBe("keep");
  });
});
