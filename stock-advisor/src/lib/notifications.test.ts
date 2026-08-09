import { describe, it, expect } from "vitest";
import { buildNotifications, renderMessage, chunkMessage } from "./notifications";
import type { Holding, HoldingVerdict, PriceQuote, Recommendation, TheoryScore } from "./types";

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

const STRONG = theory({ total: 70, verdict: "strong", catalyst: { applies: true, points: 40, type: "好決算" } });
const DILUTION = theory({ total: -30, verdict: "caution", risk: { applies: true, points: -30, type: "公募増資" } });
const HYPE = theory({ total: 0, verdict: "neutral", risk: { applies: true, points: -30, type: "過熱・煽り" } });

function quote(): PriceQuote {
  return {
    ticker: "7203.T",
    price: 3000,
    previousClose: 3000,
    changePercent: 1.5,
    volume: 1_000_000,
    avgVolume10d: 1_000_000,
    currency: "JPY",
    marketTime: null,
  };
}

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    ticker: "7203.T",
    name: "トヨタ",
    quote: quote(),
    impact: { ticker: "7203.T", score: 0, verdict: "neutral", reasoning: "", basedOn: [] },
    theory: null,
    combinedScore: 0,
    verdict: "neutral",
    cautions: [],
    ...overrides,
  };
}

function holding(ticker = "7203.T", name = "トヨタ"): Holding {
  return { id: `h-${ticker}`, ticker, name, shares: 100, costBasis: 3000 };
}

function verdict(overrides: Partial<HoldingVerdict> = {}): HoldingVerdict {
  return {
    holding: holding(),
    quote: quote(),
    unrealizedPnLPercent: 0,
    impact: null,
    theory: null,
    action: "hold",
    reasoning: "特筆事項なし",
    ...overrides,
  };
}

describe("buildNotifications — holdings", () => {
  it("alerts on a sell signal", () => {
    const ns = buildNotifications([], [verdict({ action: "sell", reasoning: "損切り水準です" })]);
    expect(ns).toHaveLength(1);
    expect(ns[0].severity).toBe("alert");
    expect(ns[0].title).toContain("売却検討");
  });

  it("alerts on dilution with its own dedupe key", () => {
    const ns = buildNotifications([], [verdict({ action: "hold", theory: DILUTION })]);
    expect(ns[0].title).toContain("公募増資");
    expect(ns[0].dedupeKey).toBe("holding-risk:7203.T:公募増資");
  });

  it("does not double-report a holding that is both risky and a sell", () => {
    const ns = buildNotifications([], [verdict({ action: "sell", theory: DILUTION })]);
    expect(ns).toHaveLength(1);
    expect(ns[0].dedupeKey).toContain("holding-risk");
  });

  it("stays quiet on a hold with nothing notable", () => {
    expect(buildNotifications([], [verdict()])).toEqual([]);
  });

  it("does not alert on mere hype about a holding", () => {
    expect(buildNotifications([], [verdict({ action: "watch", theory: HYPE })])).toEqual([]);
  });

  it("includes the ticker and the reasoning in the body", () => {
    const ns = buildNotifications([], [verdict({ action: "sell", reasoning: "損切り水準です" })]);
    expect(ns[0].lines.join("\n")).toContain("トヨタ(7203.T)");
    expect(ns[0].lines.join("\n")).toContain("損切り水準です");
  });
});

describe("buildNotifications — recommendations", () => {
  it("notifies a strong watched-account pick", () => {
    const ns = buildNotifications([rec({ theory: STRONG })], []);
    expect(ns).toHaveLength(1);
    expect(ns[0].severity).toBe("info");
    expect(ns[0].title).toContain("+70点");
  });

  it("ignores picks that are not strong", () => {
    expect(buildNotifications([rec({ theory: theory({ total: 30, verdict: "watch" }) })], [])).toEqual([]);
  });

  it("ignores stocks with no watched-account mention at all", () => {
    expect(buildNotifications([rec({ combinedScore: 90, verdict: "positive" })], [])).toEqual([]);
  });

  it("carries any cautions into the message body", () => {
    const ns = buildNotifications([rec({ theory: STRONG, cautions: ["過熱感があります"] })], []);
    expect(ns[0].lines.join("\n")).toContain("⚠ 過熱感があります");
  });

  it("includes the current price", () => {
    expect(buildNotifications([rec({ theory: STRONG })], [])[0].lines.join("\n")).toContain("3,000円");
  });
});

describe("buildNotifications — ordering", () => {
  it("puts holding alerts ahead of new picks", () => {
    const ns = buildNotifications([rec({ theory: STRONG })], [verdict({ action: "sell" })]);
    expect(ns.map((n) => n.severity)).toEqual(["alert", "info"]);
  });

  it("returns nothing when there is nothing worth interrupting for", () => {
    expect(buildNotifications([rec()], [verdict()])).toEqual([]);
  });
});

describe("renderMessage", () => {
  it("always appends the not-advice disclaimer", () => {
    expect(renderMessage(buildNotifications([rec({ theory: STRONG })], []))).toContain("投資助言ではありません");
  });

  it("renders each notification's title and lines", () => {
    const message = renderMessage(buildNotifications([], [verdict({ action: "sell", reasoning: "損切り水準です" })]));
    expect(message).toContain("【⚠ 保有株に売却検討シグナル】");
    expect(message).toContain("損切り水準です");
  });
});

describe("chunkMessage", () => {
  it("leaves a short message in one piece", () => {
    expect(chunkMessage("短い", 100)).toEqual(["短い"]);
  });

  it("splits on paragraph boundaries", () => {
    const chunks = chunkMessage(["a".repeat(40), "b".repeat(40)].join("\n\n"), 50);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("a".repeat(40));
  });

  it("keeps every chunk within the limit", () => {
    const message = Array.from({ length: 20 }, (_, i) => `段落${i}`.repeat(10)).join("\n\n");
    for (const chunk of chunkMessage(message, 100)) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("hard-splits a single paragraph that exceeds the limit on its own", () => {
    const chunks = chunkMessage("x".repeat(250), 100);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });

  it("loses no content when splitting", () => {
    const message = ["one".repeat(30), "two".repeat(30), "three".repeat(30)].join("\n\n");
    expect(chunkMessage(message, 100).join("").replace(/\n/g, "")).toBe(message.replace(/\n/g, ""));
  });
});
