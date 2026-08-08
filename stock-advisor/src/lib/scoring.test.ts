import { describe, it, expect } from "vitest";
import { buildHoldingVerdict, buildRecommendation, rankRecommendations } from "./scoring";
import type { Holding, ImpactJudgment, PriceQuote } from "./types";

function quote(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    ticker: "7203.T",
    price: 3000,
    previousClose: 3000,
    changePercent: 0,
    volume: 1_000_000,
    avgVolume10d: 1_000_000,
    currency: "JPY",
    marketTime: null,
    ...overrides,
  };
}

function impact(overrides: Partial<ImpactJudgment> = {}): ImpactJudgment {
  return { ticker: "7203.T", score: 0, verdict: "neutral", reasoning: "理由", basedOn: [], ...overrides };
}

const holding: Holding = { id: "h1", ticker: "7203.T", name: "トヨタ", shares: 100, costBasis: 3000 };

describe("buildRecommendation", () => {
  it("scores a flat, newsless stock as neutral", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact());
    expect(rec.verdict).toBe("neutral");
    expect(rec.combinedScore).toBe(0);
  });

  it("turns positive when the news impact is strongly positive", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact({ score: 80, verdict: "positive" }));
    expect(rec.verdict).toBe("positive");
    expect(rec.combinedScore).toBeGreaterThanOrEqual(20);
  });

  it("turns negative when the news impact is strongly negative", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact({ score: -80, verdict: "negative" }));
    expect(rec.verdict).toBe("negative");
    expect(rec.combinedScore).toBeLessThanOrEqual(-20);
  });

  it("lets a volume surge lift the technical component", () => {
    const calm = buildRecommendation("7203.T", "トヨタ", quote(), impact());
    const hot = buildRecommendation("7203.T", "トヨタ", quote({ volume: 3_000_000 }), impact());
    expect(hot.combinedScore).toBeGreaterThan(calm.combinedScore);
  });

  it("survives a missing 10-day average volume", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote({ avgVolume10d: null }), impact());
    expect(Number.isFinite(rec.combinedScore)).toBe(true);
  });

  it("clamps the effect of an extreme price move", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote({ changePercent: 500 }), impact());
    expect(rec.combinedScore).toBeLessThanOrEqual(100);
  });
});

describe("rankRecommendations", () => {
  it("orders by combined score, highest first", () => {
    const low = buildRecommendation("1111.T", "低", quote(), impact({ score: -50 }));
    const high = buildRecommendation("2222.T", "高", quote(), impact({ score: 90 }));
    const mid = buildRecommendation("3333.T", "中", quote(), impact({ score: 10 }));
    expect(rankRecommendations([low, high, mid]).map((r) => r.ticker)).toEqual(["2222.T", "3333.T", "1111.T"]);
  });

  it("does not mutate the input array", () => {
    const recs = [
      buildRecommendation("1111.T", "低", quote(), impact({ score: -50 })),
      buildRecommendation("2222.T", "高", quote(), impact({ score: 90 })),
    ];
    const before = recs.map((r) => r.ticker);
    rankRecommendations(recs);
    expect(recs.map((r) => r.ticker)).toEqual(before);
  });
});

describe("buildHoldingVerdict", () => {
  it("says hold when nothing notable is happening", () => {
    const v = buildHoldingVerdict(holding, quote(), impact());
    expect(v.action).toBe("hold");
    expect(v.unrealizedPnLPercent).toBe(0);
  });

  it("says sell on a strongly negative news impact", () => {
    const v = buildHoldingVerdict(holding, quote(), impact({ score: -60, verdict: "negative" }));
    expect(v.action).toBe("sell");
  });

  it("does not sell on mildly negative news", () => {
    const v = buildHoldingVerdict(holding, quote(), impact({ score: -20, verdict: "negative" }));
    expect(v.action).toBe("hold");
  });

  it("says sell when the loss passes the cut threshold", () => {
    const v = buildHoldingVerdict(holding, quote({ price: 2400 }), impact());
    expect(v.action).toBe("sell");
    expect(v.unrealizedPnLPercent).toBeCloseTo(-20);
  });

  it("holds a deep loss when the news is positive", () => {
    const v = buildHoldingVerdict(holding, quote({ price: 2400 }), impact({ score: 60, verdict: "positive" }));
    expect(v.action).toBe("hold");
  });

  it("flags a large gain for profit-taking review", () => {
    const v = buildHoldingVerdict(holding, quote({ price: 4000 }), impact());
    expect(v.action).toBe("watch");
    expect(v.unrealizedPnLPercent).toBeCloseTo(33.33, 1);
  });

  it("keeps holding a large gain while the news stays positive", () => {
    const v = buildHoldingVerdict(holding, quote({ price: 4000 }), impact({ score: 60, verdict: "positive" }));
    expect(v.action).toBe("hold");
  });

  it("degrades to hold when the quote could not be fetched", () => {
    const v = buildHoldingVerdict(holding, null, impact());
    expect(v.action).toBe("hold");
    expect(v.unrealizedPnLPercent).toBeNull();
    expect(v.reasoning).toContain("現在値を取得できませんでした");
  });

  it("still sells on bad news even without a quote", () => {
    const v = buildHoldingVerdict(holding, null, impact({ score: -60, verdict: "negative" }));
    expect(v.action).toBe("sell");
  });

  it("handles a missing impact judgment", () => {
    const v = buildHoldingVerdict(holding, quote(), null);
    expect(v.action).toBe("hold");
    expect(v.reasoning).toContain("ニュース材料は未取得です");
  });
});
