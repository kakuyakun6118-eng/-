import { describe, it, expect } from "vitest";
import { buildHoldingVerdict, buildRecommendation, rankRecommendations } from "./scoring";
import type { Holding, ImpactJudgment, PriceQuote, TheoryScore } from "./types";

function theory(overrides: Partial<TheoryScore> = {}): TheoryScore {
  return {
    ticker: "7203.T",
    buzz: { applies: false, points: 0, articles24h: 0, baselineDaily: null, ratio: null, baselineSource: null, detail: "" },
    catalyst: { applies: false, points: 0, type: null },
    risk: { applies: false, points: 0, type: null },
    total: 0,
    verdict: "neutral",
    reasoning: "理論スコアの根拠",
    ...overrides,
  };
}

/** The scorecard's best case: surge + catalyst, no risk. */
const STRONG = theory({
  buzz: { applies: true, points: 30, articles24h: 5, baselineDaily: 1, ratio: 5, baselineSource: "feed", detail: "急増" },
  catalyst: { applies: true, points: 40, type: "好決算" },
  total: 70,
  verdict: "strong",
});

const HYPE = theory({
  buzz: { applies: true, points: 30, articles24h: 5, baselineDaily: 1, ratio: 5, baselineSource: "feed", detail: "急増" },
  risk: { applies: true, points: -30, type: "過熱・煽り" },
  total: 0,
  verdict: "neutral",
});

const DILUTION = theory({ risk: { applies: true, points: -30, type: "公募増資" }, total: -30, verdict: "caution" });
const SCANDAL = theory({ risk: { applies: true, points: -30, type: "不祥事" }, total: -30, verdict: "caution" });

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

describe("buildRecommendation — theory signal", () => {
  it("leaves the score untouched when there is no theory score", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact());
    expect(rec.theory).toBeNull();
    expect(rec.combinedScore).toBe(0);
  });

  it("lifts a stock the scorecard is positive about", () => {
    const without = buildRecommendation("7203.T", "トヨタ", quote(), impact());
    const with_ = buildRecommendation("7203.T", "トヨタ", quote(), impact(), STRONG);
    expect(with_.combinedScore).toBeGreaterThan(without.combinedScore);
    expect(with_.verdict).toBe("positive");
  });

  it("drags the score down when the scorecard carries a risk flag", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact(), DILUTION);
    expect(rec.combinedScore).toBeLessThan(0);
  });

  it("raises a caution when the coverage is hype", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact(), HYPE);
    expect(rec.cautions).toHaveLength(1);
    expect(rec.cautions[0]).toContain("煽り");
  });

  it("names the risk type in the caution for material risks", () => {
    expect(buildRecommendation("7203.T", "トヨタ", quote(), impact(), SCANDAL).cautions[0]).toContain("不祥事");
  });

  it("raises no caution when the coverage is clean", () => {
    expect(buildRecommendation("7203.T", "トヨタ", quote(), impact(), STRONG).cautions).toEqual([]);
  });

  it("keeps a hyped stock below one with the same buzz and a real catalyst", () => {
    const hyped = buildRecommendation("7203.T", "A", quote(), impact(), HYPE);
    const solid = buildRecommendation("6758.T", "B", quote(), impact(), STRONG);
    expect(solid.combinedScore).toBeGreaterThan(hyped.combinedScore);
  });

  it("does not let the scorecard override strongly negative news", () => {
    const rec = buildRecommendation("7203.T", "トヨタ", quote(), impact({ score: -100, verdict: "negative" }), STRONG);
    expect(rec.combinedScore).toBeLessThan(0);
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

describe("buildHoldingVerdict — theory signal", () => {
  it("sells on reported dilution", () => {
    const v = buildHoldingVerdict(holding, quote(), impact(), DILUTION);
    expect(v.action).toBe("sell");
    expect(v.reasoning).toContain("公募増資");
  });

  it("sells on reported misconduct", () => {
    const v = buildHoldingVerdict(holding, quote(), impact(), SCANDAL);
    expect(v.action).toBe("sell");
    expect(v.reasoning).toContain("不祥事");
  });

  it("sells on dilution even while sitting on a large gain", () => {
    expect(buildHoldingVerdict(holding, quote({ price: 4000 }), impact(), DILUTION).action).toBe("sell");
  });

  it("only watches — does not sell — when the coverage is mere hype", () => {
    const v = buildHoldingVerdict(holding, quote(), impact(), theory({ risk: { applies: true, points: -30, type: "過熱・煽り" }, total: -30, verdict: "caution" }));
    expect(v.action).toBe("watch");
    expect(v.reasoning).toContain("過熱");
  });

  it("holds a deep loss when the scorecard gives a positive reason", () => {
    const v = buildHoldingVerdict(holding, quote({ price: 2400 }), impact(), STRONG);
    expect(v.action).toBe("hold");
  });

  it("keeps holding a large gain while the scorecard stays positive", () => {
    expect(buildHoldingVerdict(holding, quote({ price: 4000 }), impact(), STRONG).action).toBe("hold");
  });

  it("still sells on very bad news despite a positive scorecard", () => {
    const v = buildHoldingVerdict(holding, quote(), impact({ score: -60, verdict: "negative" }), STRONG);
    expect(v.action).toBe("sell");
  });

  it("surfaces the scorecard reasoning in the explanation", () => {
    expect(buildHoldingVerdict(holding, quote(), impact(), STRONG).reasoning).toContain("理論スコア");
  });

  it("behaves exactly as before when there is no theory score", () => {
    const withNull = buildHoldingVerdict(holding, quote(), impact(), null);
    const withoutArg = buildHoldingVerdict(holding, quote(), impact());
    expect(withNull.action).toBe(withoutArg.action);
    expect(withNull.reasoning).toBe(withoutArg.reasoning);
  });
});
