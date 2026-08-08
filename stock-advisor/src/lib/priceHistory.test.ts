import { describe, it, expect } from "vitest";
import { closeOnOrAfter, closeAfterTradingDays, percentChange, type DailyClose } from "./priceHistory";

/** Weekdays only, as a real series would be. */
const series: DailyClose[] = [
  { date: "2026-08-03", adjClose: 100 },
  { date: "2026-08-04", adjClose: 102 },
  { date: "2026-08-05", adjClose: 104 },
  { date: "2026-08-06", adjClose: 103 },
  { date: "2026-08-07", adjClose: 110 },
  { date: "2026-08-10", adjClose: 120 },
];

describe("closeOnOrAfter", () => {
  it("finds an exact session", () => {
    expect(closeOnOrAfter(series, "2026-08-05")?.adjClose).toBe(104);
  });

  it("skips forward over a non-trading day", () => {
    // 8/8 and 8/9 are a weekend.
    expect(closeOnOrAfter(series, "2026-08-08")?.adjClose).toBe(120);
  });

  it("returns null when the series ends before the date", () => {
    expect(closeOnOrAfter(series, "2026-09-01")).toBeNull();
  });

  it("returns null for an empty series", () => {
    expect(closeOnOrAfter([], "2026-08-05")).toBeNull();
  });
});

describe("closeAfterTradingDays", () => {
  it("counts sessions, not calendar days", () => {
    // One session after Friday 8/7 is Monday 8/10, not Saturday.
    expect(closeAfterTradingDays(series, "2026-08-07", 1)?.date).toBe("2026-08-10");
  });

  it("returns the same session for a zero horizon", () => {
    expect(closeAfterTradingDays(series, "2026-08-03", 0)?.adjClose).toBe(100);
  });

  it("walks the requested number of sessions", () => {
    expect(closeAfterTradingDays(series, "2026-08-03", 4)?.adjClose).toBe(110);
  });

  it("returns null when the horizon has not elapsed yet", () => {
    expect(closeAfterTradingDays(series, "2026-08-07", 20)).toBeNull();
  });

  it("returns null when the start date is past the series", () => {
    expect(closeAfterTradingDays(series, "2026-12-01", 1)).toBeNull();
  });
});

describe("percentChange", () => {
  it("computes a gain", () => {
    expect(percentChange(100, 110)).toBeCloseTo(10);
  });

  it("computes a loss", () => {
    expect(percentChange(100, 90)).toBeCloseTo(-10);
  });

  it("refuses to divide by zero", () => {
    expect(percentChange(0, 100)).toBeNull();
  });

  it("rejects a negative base", () => {
    expect(percentChange(-5, 100)).toBeNull();
  });

  it("rejects non-finite input", () => {
    expect(percentChange(NaN, 100)).toBeNull();
    expect(percentChange(100, NaN)).toBeNull();
  });

  it("is unaffected by a split, because the series is adjusted", () => {
    // A 1:3 split leaves adjusted closes continuous; a raw series would show -67%.
    const adjusted: DailyClose[] = [
      { date: "2026-08-03", adjClose: 100 },
      { date: "2026-08-04", adjClose: 101 },
    ];
    const base = closeOnOrAfter(adjusted, "2026-08-03")!;
    const after = closeAfterTradingDays(adjusted, "2026-08-03", 1)!;
    expect(percentChange(base.adjClose, after.adjClose)).toBeCloseTo(1);
  });
});
