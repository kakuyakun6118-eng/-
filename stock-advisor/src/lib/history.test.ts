import { describe, it, expect } from "vitest";
import {
  jstDateKey,
  historicalBaselineDaily,
  mergeMentionCounts,
  mergeSnapshots,
  buildOutcome,
  summarizeByVerdict,
  toSnapshot,
  MIN_HISTORY_DAYS,
  type MentionHistory,
  type Snapshot,
  type SnapshotOutcome,
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

describe("buildOutcome", () => {
  const now = new Date("2026-08-18T00:00:00Z");

  it("computes the return since the call", () => {
    expect(buildOutcome(snap({ price: 3000 }), 3300, now).returnPercent).toBeCloseTo(10);
  });

  it("reports a loss as a negative return", () => {
    expect(buildOutcome(snap({ price: 3000 }), 2700, now).returnPercent).toBeCloseTo(-10);
  });

  it("counts the days elapsed", () => {
    expect(buildOutcome(snap(), 3000, now).daysElapsed).toBe(10);
  });

  it("returns null when the price at call time is unknown", () => {
    expect(buildOutcome(snap({ price: null }), 3000, now).returnPercent).toBeNull();
  });

  it("returns null when the current price is unknown", () => {
    expect(buildOutcome(snap(), null, now).returnPercent).toBeNull();
  });

  it("avoids dividing by a zero baseline price", () => {
    expect(buildOutcome(snap({ price: 0 }), 3000, now).returnPercent).toBeNull();
  });
});

describe("summarizeByVerdict", () => {
  const now = new Date("2026-08-18T00:00:00Z");
  const outcomes: SnapshotOutcome[] = [
    buildOutcome(snap({ ticker: "A", theoryVerdict: "strong", price: 100 }), 110, now),
    buildOutcome(snap({ ticker: "B", theoryVerdict: "strong", price: 100 }), 130, now),
    buildOutcome(snap({ ticker: "C", theoryVerdict: "strong", price: 100 }), 90, now),
    buildOutcome(snap({ ticker: "D", theoryVerdict: "caution", price: 100 }), 80, now),
  ];

  it("reports every band, including empty ones", () => {
    expect(summarizeByVerdict(outcomes).map((s) => s.verdict)).toEqual(["strong", "watch", "neutral", "caution"]);
  });

  it("computes the share of calls that went up", () => {
    const strong = summarizeByVerdict(outcomes).find((s) => s.verdict === "strong")!;
    expect(strong.count).toBe(3);
    expect(strong.hitRate).toBeCloseTo(2 / 3);
  });

  it("averages the returns within a band", () => {
    const strong = summarizeByVerdict(outcomes).find((s) => s.verdict === "strong")!;
    expect(strong.averageReturnPercent).toBeCloseTo((10 + 30 - 10) / 3);
  });

  it("leaves stats null for a band with no calls", () => {
    const watch = summarizeByVerdict(outcomes).find((s) => s.verdict === "watch")!;
    expect(watch.count).toBe(0);
    expect(watch.hitRate).toBeNull();
    expect(watch.averageReturnPercent).toBeNull();
  });

  it("ignores calls whose return could not be measured", () => {
    const withUnmeasured = [...outcomes, buildOutcome(snap({ ticker: "E", theoryVerdict: "caution", price: null }), null, now)];
    const caution = summarizeByVerdict(withUnmeasured).find((s) => s.verdict === "caution")!;
    expect(caution.count).toBe(2);
    expect(caution.hitRate).toBe(0);
    expect(caution.averageReturnPercent).toBeCloseTo(-20);
  });
});
