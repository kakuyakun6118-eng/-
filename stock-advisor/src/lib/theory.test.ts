import { describe, it, expect } from "vitest";
import { computeBuzzSurge, combineScore, verdictFor, POINTS, SURGE_MULTIPLIER, MIN_MENTIONS_WITHOUT_BASELINE } from "./theory";
import type { SocialPost } from "./socialSource";
import type { BuzzSurge, ContentAssessment } from "./types";

const NOW = new Date("2026-08-08T12:00:00Z");
const TICKER = "7203.T";

/** `hoursAgo` back from NOW. */
function post(hoursAgo: number, tickers: string[] = [TICKER], id = String(Math.random())): SocialPost {
  return {
    handle: "someone",
    id,
    text: `${tickers.join(" ")} の話`,
    url: `https://x.com/someone/status/${id}`,
    createdAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    tickers,
  };
}

/** A 10-day window of context so a baseline can be established. */
const WINDOW_ANCHOR = post(24 * 10, ["9999.T"]);

describe("computeBuzzSurge — rule 1 (話題性の急上昇)", () => {
  it("reports nothing to judge when no posts were fetched", () => {
    const buzz = computeBuzzSurge(TICKER, [], NOW);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
    expect(buzz.detail).toContain("投稿を取得できていない");
  });

  it("refuses to judge when the window has under a day of history behind it", () => {
    const buzz = computeBuzzSurge(TICKER, [post(1), post(2), post(10)], NOW);
    expect(buzz.applies).toBe(false);
    expect(buzz.baselineDaily).toBeNull();
    expect(buzz.detail).toContain("判定できません");
  });

  it("counts only the last 24 hours as recent mentions", () => {
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1), post(23), post(25), post(48)], NOW);
    expect(buzz.mentions24h).toBe(2);
  });

  it("awards +30 when mentions reach the 3x threshold", () => {
    // 9 older mentions over a 9-day baseline = 1.0/day; 3 in 24h = 3.0x.
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2), post(3)], NOW);
    expect(buzz.ratio).toBeGreaterThanOrEqual(SURGE_MULTIPLIER);
    expect(buzz.applies).toBe(true);
    expect(buzz.points).toBe(POINTS.buzzSurge);
  });

  it("awards nothing when mentions stay under the threshold", () => {
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2)], NOW);
    expect(buzz.ratio).toBeLessThan(SURGE_MULTIPLIER);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
  });

  it("treats a previously unmentioned ticker with enough posts as a new topic", () => {
    const posts = [WINDOW_ANCHOR, ...Array.from({ length: MIN_MENTIONS_WITHOUT_BASELINE }, (_, i) => post(i + 1))];
    const buzz = computeBuzzSurge(TICKER, posts, NOW);
    expect(buzz.baselineDaily).toBe(0);
    expect(buzz.applies).toBe(true);
    expect(buzz.detail).toContain("新規の話題");
  });

  it("does not let a single stray post score the full surge", () => {
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1)], NOW);
    expect(buzz.mentions24h).toBe(1);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
  });

  it("ignores mentions of other tickers when counting", () => {
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1, ["6758.T"]), post(2, ["6758.T"])], NOW);
    expect(buzz.mentions24h).toBe(0);
    expect(buzz.applies).toBe(false);
  });

  it("counts a post that mentions several tickers toward each of them", () => {
    const posts = [WINDOW_ANCHOR, post(1, [TICKER, "6758.T"]), post(2, [TICKER, "6758.T"])];
    expect(computeBuzzSurge(TICKER, posts, NOW).mentions24h).toBe(2);
    expect(computeBuzzSurge("6758.T", posts, NOW).mentions24h).toBe(2);
  });

  it("explains its arithmetic in the detail text", () => {
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2), post(3)], NOW);
    expect(buzz.detail).toContain("直近24時間の言及3件");
    expect(buzz.detail).toContain("倍");
  });
});

describe("computeBuzzSurge — recorded-history baseline", () => {
  it("uses the supplied history baseline instead of the post window", () => {
    // The window alone would show 2 older mentions over ~9 days (≈0.2/day).
    const older = [post(24 * 5), post(24 * 8)];
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2)], NOW, 4);
    expect(buzz.baselineSource).toBe("history");
    expect(buzz.baselineDaily).toBe(4);
    expect(buzz.ratio).toBeCloseTo(0.5);
    expect(buzz.applies).toBe(false);
  });

  it("marks the baseline as window-derived when no history is given", () => {
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    expect(computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1)], NOW).baselineSource).toBe("window");
  });

  it("judges even when the window is too short, once history is available", () => {
    // Only a few hours of window — normally undecidable.
    const buzz = computeBuzzSurge(TICKER, [post(1), post(2), post(3)], NOW, 0.5);
    expect(buzz.baselineSource).toBe("history");
    expect(buzz.applies).toBe(true);
    expect(buzz.points).toBe(POINTS.buzzSurge);
  });

  it("still needs posts before it will judge anything", () => {
    const buzz = computeBuzzSurge(TICKER, [], NOW, 2);
    expect(buzz.applies).toBe(false);
    expect(buzz.baselineSource).toBeNull();
  });

  it("treats a zero history baseline as the new-topic case", () => {
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1), post(2)], NOW, 0);
    expect(buzz.baselineDaily).toBe(0);
    expect(buzz.applies).toBe(true);
    expect(buzz.detail).toContain("新規の話題");
  });

  it("names the baseline source in the explanation", () => {
    expect(computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1)], NOW, 1).detail).toContain("記録済みの日次履歴");
  });
});

describe("verdictFor", () => {
  it.each([
    [70, "strong"],
    [40, "strong"],
    [30, "watch"],
    [10, "watch"],
    [0, "neutral"],
    [-30, "caution"],
  ])("maps %i to %s", (total, expected) => {
    expect(verdictFor(total)).toBe(expected);
  });
});

describe("combineScore", () => {
  const noBuzz = computeBuzzSurge(TICKER, [], NOW);
  const surge: BuzzSurge = {
    applies: true,
    points: POINTS.buzzSurge,
    mentions24h: 5,
    baselineDaily: 1,
    ratio: 5,
    baselineSource: "window",
    detail: "急増",
  };

  function content(overrides: Partial<ContentAssessment> = {}): ContentAssessment {
    return { positiveCatalyst: false, catalystType: null, riskFlag: false, riskType: null, reasoning: "理由", ...overrides };
  }

  it("totals all three rules when everything fires", () => {
    const score = combineScore(TICKER, surge, content({ positiveCatalyst: true, catalystType: "好決算", riskFlag: true, riskType: "イナゴ集め" }));
    expect(score.total).toBe(POINTS.buzzSurge + POINTS.positiveCatalyst + POINTS.risk);
    expect(score.total).toBe(40);
  });

  it("reaches the maximum of 70 on a clean surge with a catalyst", () => {
    const score = combineScore(TICKER, surge, content({ positiveCatalyst: true, catalystType: "好決算" }));
    expect(score.total).toBe(70);
    expect(score.verdict).toBe("strong");
  });

  it("bottoms out at -30 when only the risk applies", () => {
    const score = combineScore(TICKER, noBuzz, content({ riskFlag: true, riskType: "公募増資" }));
    expect(score.total).toBe(-30);
    expect(score.verdict).toBe("caution");
  });

  it("scores zero when no rule applies", () => {
    const score = combineScore(TICKER, noBuzz, content());
    expect(score.total).toBe(0);
    expect(score.verdict).toBe("neutral");
  });

  it("carries the catalyst and risk labels through", () => {
    const score = combineScore(TICKER, noBuzz, content({ positiveCatalyst: true, catalystType: "新技術・新サービス", riskFlag: true, riskType: "不祥事" }));
    expect(score.catalyst.type).toBe("新技術・新サービス");
    expect(score.risk.type).toBe("不祥事");
  });

  it("merges the buzz detail and the LLM reasoning into one explanation", () => {
    const score = combineScore(TICKER, surge, content({ reasoning: "好決算に言及。" }));
    expect(score.reasoning).toContain("急増");
    expect(score.reasoning).toContain("好決算に言及。");
  });

  it("treats hype without a catalyst as a straight deduction", () => {
    const score = combineScore(TICKER, surge, content({ riskFlag: true, riskType: "イナゴ集め" }));
    expect(score.total).toBe(0);
    expect(score.verdict).toBe("neutral");
  });
});
