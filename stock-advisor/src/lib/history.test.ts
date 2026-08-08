import { describe, it, expect } from "vitest";
import {
  jstDateKey,
  historicalBaselineDaily,
  mergeMentionCounts,
  mergeSnapshots,
  summarizeByVerdict,
  HORIZONS,
  toSnapshot,
  MIN_HISTORY_DAYS,
  type MentionHistory,
  type Snapshot,
  type SnapshotOutcome,
  type Horizon,
} from "./history";
import type { TheoryScore } from "./types";

describe("jstDateKey", () => {
  it("uses the JST calendar day, not UTC", () => {
    // 23:00 UTC is already the next day in Tokyo.
    expect(jstDateKey(new Date("2026-08-07T23:00:00Z"))).toBe("2026-08-08");
  });

  it("keeps the same day earlier in the UTC afternoon", () => {
    expect(jstDateKey(new Date("2026-08-08T05:00:00Z"))).toBe("2026-08-08");
  });

  it("handles the JST midnight boundary", () => {
    expect(jstDateKey(new Date("2026-08-07T14:59:59Z"))).toBe("2026-08-07");
    expect(jstDateKey(new Date("2026-08-07T15:00:00Z"))).toBe("2026-08-08");
  });
});

describe("historicalBaselineDaily", () => {
  const history: MentionHistory = {
    "2026-08-01": { "7203.T": 2 },
    "2026-08-02": { "7203.T": 0 },
    "2026-08-03": { "7203.T": 4 },
    "2026-08-04": { "6758.T": 5 },
  };

  it("averages the ticker's counts over recorded days", () => {
    // 2 + 0 + 4 + 0 across four prior days.
    expect(historicalBaselineDaily("7203.T", history, "2026-08-05")).toBe(1.5);
  });

  it("counts days with no entry for the ticker as zero", () => {
    expect(historicalBaselineDaily("6758.T", history, "2026-08-05")).toBe(1.25);
  });

  it("excludes the current day from the baseline", () => {
    const withToday: MentionHistory = { ...history, "2026-08-05": { "7203.T": 99 } };
    expect(historicalBaselineDaily("7203.T", withToday, "2026-08-05")).toBe(1.5);
  });

  it("returns null until enough days have been recorded", () => {
    const thin: MentionHistory = { "2026-08-01": { "7203.T": 1 }, "2026-08-02": { "7203.T": 1 } };
    expect(historicalBaselineDaily("7203.T", thin, "2026-08-05")).toBeNull();
  });

  it("becomes available exactly at the minimum day count", () => {
    const days = Object.fromEntries(
      Array.from({ length: MIN_HISTORY_DAYS }, (_, i) => [`2026-08-0${i + 1}`, { "7203.T": 3 }])
    ) as MentionHistory;
    expect(historicalBaselineDaily("7203.T", days, "2026-08-09")).toBe(3);
  });

  it("returns zero for a ticker that has never been mentioned", () => {
    expect(historicalBaselineDaily("9999.T", history, "2026-08-05")).toBe(0);
  });
});

describe("mergeMentionCounts", () => {
  it("replaces the day's counts rather than accumulating them", () => {
    const before: MentionHistory = { "2026-08-08": { "7203.T": 5 } };
    const after = mergeMentionCounts(before, "2026-08-08", { "7203.T": 2 });
    expect(after["2026-08-08"]).toEqual({ "7203.T": 2 });
  });

  it("leaves other days untouched", () => {
    const before: MentionHistory = { "2026-08-07": { "7203.T": 1 } };
    expect(mergeMentionCounts(before, "2026-08-08", {})["2026-08-07"]).toEqual({ "7203.T": 1 });
  });
});

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    date: "2026-08-08",
    recordedAt: "2026-08-08T00:00:00Z",
    ticker: "7203.T",
    mentions24h: 3,
    theoryTotal: 70,
    theoryVerdict: "strong",
    buzzApplies: true,
    catalystType: "好決算",
    riskType: null,
    price: 3000,
    ...overrides,
  };
}

describe("mergeSnapshots", () => {
  it("replaces the same day's snapshots so re-recording is idempotent", () => {
    const existing = [snap({ theoryTotal: 30 })];
    const merged = mergeSnapshots(existing, "2026-08-08", [snap({ theoryTotal: 70 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].theoryTotal).toBe(70);
  });

  it("keeps snapshots from other days", () => {
    const existing = [snap({ date: "2026-08-07" })];
    expect(mergeSnapshots(existing, "2026-08-08", [snap()])).toHaveLength(2);
  });
});

describe("toSnapshot", () => {
  const score: TheoryScore = {
    ticker: "7203.T",
    buzz: { applies: true, points: 30, mentions24h: 4, baselineDaily: 1, ratio: 4, baselineSource: "history", detail: "" },
    catalyst: { applies: true, points: 40, type: "好決算" },
    risk: { applies: false, points: 0, type: null },
    total: 70,
    verdict: "strong",
    reasoning: "",
  };

  it("captures the price at call time as the verification baseline", () => {
    expect(toSnapshot(score, "2026-08-08", "2026-08-08T00:00:00Z", 3000).price).toBe(3000);
  });

  it("keeps the mention count and scorecard outcome", () => {
    const s = toSnapshot(score, "2026-08-08", "2026-08-08T00:00:00Z", 3000, "トヨタ");
    expect(s.mentions24h).toBe(4);
    expect(s.theoryVerdict).toBe("strong");
    expect(s.catalystType).toBe("好決算");
    expect(s.name).toBe("トヨタ");
  });

  it("tolerates a price that could not be fetched", () => {
    expect(toSnapshot(score, "2026-08-08", "2026-08-08T00:00:00Z", null).price).toBeNull();
  });
});

function outcome(overrides: Partial<SnapshotOutcome> = {}): SnapshotOutcome {
  const horizons = Object.fromEntries(HORIZONS.map((h) => [h, null])) as Record<Horizon, number | null>;
  return {
    ...snap(),
    basePrice: 100,
    currentPrice: 100,
    currentReturnPercent: 0,
    horizonReturns: horizons,
    daysElapsed: 30,
    measured: true,
    ...overrides,
  };
}

function withReturns(verdict: SnapshotOutcome["theoryVerdict"], returns: Partial<Record<Horizon, number>>, ticker = "A"): SnapshotOutcome {
  const horizons = Object.fromEntries(HORIZONS.map((h) => [h, returns[h] ?? null])) as Record<Horizon, number | null>;
  return outcome({ ticker, theoryVerdict: verdict, horizonReturns: horizons });
}

describe("summarizeByVerdict", () => {
  it("reports every band, including empty ones", () => {
    expect(summarizeByVerdict([]).map((s) => s.verdict)).toEqual(["strong", "watch", "neutral", "caution"]);
  });

  it("keeps each horizon's statistics separate", () => {
    const rows = [
      withReturns("strong", { 1: 2, 5: 10, 20: 30 }, "A"),
      withReturns("strong", { 1: -1, 5: 5, 20: -10 }, "B"),
    ];
    const strong = summarizeByVerdict(rows).find((s) => s.verdict === "strong")!;
    expect(strong.byHorizon[1].averageReturnPercent).toBeCloseTo(0.5);
    expect(strong.byHorizon[5].averageReturnPercent).toBeCloseTo(7.5);
    expect(strong.byHorizon[20].averageReturnPercent).toBeCloseTo(10);
  });

  it("computes the hit rate per horizon", () => {
    const rows = [
      withReturns("strong", { 1: 5, 20: -5 }, "A"),
      withReturns("strong", { 1: 5, 20: 5 }, "B"),
    ];
    const strong = summarizeByVerdict(rows).find((s) => s.verdict === "strong")!;
    expect(strong.byHorizon[1].hitRate).toBe(1);
    expect(strong.byHorizon[20].hitRate).toBe(0.5);
  });

  it("excludes calls whose horizon has not elapsed yet", () => {
    // Recorded yesterday: the 1-day return exists, the 20-day one does not.
    const rows = [withReturns("strong", { 1: 3 }, "A")];
    const strong = summarizeByVerdict(rows).find((s) => s.verdict === "strong")!;
    expect(strong.count).toBe(1);
    expect(strong.byHorizon[1].measured).toBe(1);
    expect(strong.byHorizon[20].measured).toBe(0);
    expect(strong.byHorizon[20].hitRate).toBeNull();
  });

  it("counts a call in its band even when nothing could be measured", () => {
    const rows = [outcome({ theoryVerdict: "caution", measured: false })];
    const caution = summarizeByVerdict(rows).find((s) => s.verdict === "caution")!;
    expect(caution.count).toBe(1);
    expect(caution.byHorizon[5].measured).toBe(0);
  });

  it("does not mix bands together", () => {
    const rows = [withReturns("strong", { 5: 10 }, "A"), withReturns("caution", { 5: -10 }, "B")];
    const summary = summarizeByVerdict(rows);
    expect(summary.find((s) => s.verdict === "strong")!.byHorizon[5].averageReturnPercent).toBeCloseTo(10);
    expect(summary.find((s) => s.verdict === "caution")!.byHorizon[5].averageReturnPercent).toBeCloseTo(-10);
  });
});
