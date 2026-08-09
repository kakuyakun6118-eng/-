import { describe, it, expect } from "vitest";
import { computeBuzzSurge, combineScore, verdictFor, POINTS, SURGE_MULTIPLIER, MIN_ARTICLES_FOR_SURGE } from "./theory";
import type { BuzzSurge, ContentAssessment, NewsItem } from "./types";

const NOW = new Date("2026-08-08T12:00:00Z");
const TICKER = "7203.T";

/** An article published `hoursAgo` before NOW. */
function post(hoursAgo: number, ticker = TICKER, id = String(Math.random())): NewsItem {
  return {
    ticker,
    title: `${ticker} の記事 ${id}`,
    link: `https://news.example/${id}`,
    pubDate: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    source: "テスト通信",
  };
}

/** A 10-day-old article, so the feed reaches back far enough for a baseline. */
const WINDOW_ANCHOR = post(24 * 10);

describe("computeBuzzSurge — rule 1 (話題性の急上昇)", () => {
  it("reports nothing to judge when no posts were fetched", () => {
    const buzz = computeBuzzSurge(TICKER, [], NOW);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
    expect(buzz.detail).toContain("日付付きの記事を取得できていない");
  });

  it("refuses to judge when the window has under a day of history behind it", () => {
    const buzz = computeBuzzSurge(TICKER, [post(1), post(2), post(10)], NOW);
    expect(buzz.applies).toBe(false);
    expect(buzz.baselineDaily).toBeNull();
    expect(buzz.detail).toContain("判定できません");
  });

  it("counts only the last 24 hours as recent articles", () => {
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1), post(23), post(25), post(48)], NOW);
    expect(buzz.articles24h).toBe(2);
  });

  it("awards +30 when coverage reaches the 3x threshold", () => {
    // 3 older articles across a 9-day baseline = 0.33/day; 3 in 24h = 9x.
    const older = [post(24 * 3), post(24 * 6), WINDOW_ANCHOR];
    const buzz = computeBuzzSurge(TICKER, [...older, post(1), post(2), post(3)], NOW);
    expect(buzz.ratio).toBeGreaterThanOrEqual(SURGE_MULTIPLIER);
    expect(buzz.applies).toBe(true);
    expect(buzz.points).toBe(POINTS.buzzSurge);
  });

  it("awards nothing when coverage stays under the threshold", () => {
    // 27 older articles across 9 days = 3/day; 3 in 24h is only 1x.
    const older = Array.from({ length: 27 }, (_, i) => post(24 * (2 + (i % 9))));
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2), post(3)], NOW);
    expect(buzz.ratio).toBeLessThan(SURGE_MULTIPLIER);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
  });

  it("treats a stock with no recorded coverage as a new topic", () => {
    // A zero baseline can only come from recorded history: a per-ticker feed
    // that reaches back a day always contains at least one older article.
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1), post(2)], NOW, 0);
    expect(buzz.baselineDaily).toBe(0);
    expect(buzz.applies).toBe(true);
    expect(buzz.detail).toContain("新規の話題");
  });

  it("applies once the article floor is reached", () => {
    const feed = [WINDOW_ANCHOR, ...Array.from({ length: MIN_ARTICLES_FOR_SURGE }, (_, i) => post(i + 1))];
    const buzz = computeBuzzSurge(TICKER, feed, NOW);
    expect(buzz.articles24h).toBe(MIN_ARTICLES_FOR_SURGE);
    expect(buzz.applies).toBe(true);
  });

  it("does not let a single article score the full surge on a thinly covered stock", () => {
    // 1 article against a 0.1/day baseline is nominally 9x, but one article is
    // not a surge — this is the false positive the absolute floor exists for.
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, post(1)], NOW);
    expect(buzz.articles24h).toBe(1);
    expect(buzz.ratio).toBeGreaterThan(SURGE_MULTIPLIER);
    expect(buzz.applies).toBe(false);
    expect(buzz.points).toBe(0);
    expect(buzz.detail).toContain("件に満たないため");
  });



  it("explains its arithmetic in the detail text", () => {
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2), post(3)], NOW);
    expect(buzz.detail).toContain("直近24時間の記事3件");
    expect(buzz.detail).toContain("倍");
  });
});

describe("computeBuzzSurge — recorded-history baseline", () => {
  it("uses the supplied history baseline instead of the feed", () => {
    // The feed alone would show 3 older articles over ~9 days (≈0.3/day).
    const older = [post(24 * 5), post(24 * 8)];
    const buzz = computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1), post(2)], NOW, 4);
    expect(buzz.baselineSource).toBe("history");
    expect(buzz.baselineDaily).toBe(4);
    expect(buzz.ratio).toBeCloseTo(0.5);
    expect(buzz.applies).toBe(false);
  });

  it("marks the baseline as feed-derived when no history is given", () => {
    const older = Array.from({ length: 9 }, (_, i) => post(24 * (i + 2)));
    expect(computeBuzzSurge(TICKER, [WINDOW_ANCHOR, ...older, post(1)], NOW).baselineSource).toBe("feed");
  });

  it("judges even when the feed is too short, once history is available", () => {
    // Only a few hours of feed — normally undecidable.
    const buzz = computeBuzzSurge(TICKER, [post(1), post(2), post(3)], NOW, 0.5);
    expect(buzz.baselineSource).toBe("history");
    expect(buzz.applies).toBe(true);
    expect(buzz.points).toBe(POINTS.buzzSurge);
  });

  it("still needs articles before it will judge anything", () => {
    const buzz = computeBuzzSurge(TICKER, [], NOW, 2);
    expect(buzz.applies).toBe(false);
    expect(buzz.baselineSource).toBeNull();
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
    articles24h: 5,
    baselineDaily: 1,
    ratio: 5,
    baselineSource: "feed",
    detail: "急増",
  };

  function content(overrides: Partial<ContentAssessment> = {}): ContentAssessment {
    return { positiveCatalyst: false, catalystType: null, riskFlag: false, riskType: null, reasoning: "理由", ...overrides };
  }

  it("totals all three rules when everything fires", () => {
    const score = combineScore(TICKER, surge, content({ positiveCatalyst: true, catalystType: "好決算", riskFlag: true, riskType: "過熱・煽り" }));
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
    const score = combineScore(TICKER, surge, content({ riskFlag: true, riskType: "過熱・煽り" }));
    expect(score.total).toBe(0);
    expect(score.verdict).toBe("neutral");
  });
});

describe("verdictFor — a standing risk flag caps the band", () => {
  it("never calls a risky name 有力, however high the total", () => {
    expect(verdictFor(70, true)).toBe("watch");
    expect(verdictFor(40, true)).toBe("watch");
  });

  it("leaves clean names unaffected", () => {
    expect(verdictFor(70, false)).toBe("strong");
    expect(verdictFor(40, false)).toBe("strong");
  });

  it("drops a low-scoring risky name to 中立", () => {
    expect(verdictFor(0, true)).toBe("neutral");
  });

  it("still reports a negative total as 警戒", () => {
    expect(verdictFor(-30, true)).toBe("caution");
  });
});

describe("combineScore — the 40-point ambiguity", () => {
  const surge: BuzzSurge = {
    applies: true,
    points: POINTS.buzzSurge,
    articles24h: 5,
    baselineDaily: 1,
    ratio: 5,
    baselineSource: "feed",
    detail: "急増",
  };
  const noBuzz = computeBuzzSurge(TICKER, [], NOW);
  const base = { positiveCatalyst: false, catalystType: null, riskFlag: false, riskType: null, reasoning: "" };

  it("separates a hyped 40 from a clean 40", () => {
    const hyped = combineScore(TICKER, surge, { ...base, positiveCatalyst: true, catalystType: "好決算", riskFlag: true, riskType: "過熱・煽り" });
    const clean = combineScore(TICKER, noBuzz, { ...base, positiveCatalyst: true, catalystType: "好決算" });

    expect(hyped.total).toBe(40);
    expect(clean.total).toBe(40);
    // Same score, different verdict — which was the point of the fix.
    expect(hyped.verdict).toBe("watch");
    expect(clean.verdict).toBe("strong");
  });

  it("keeps the perfect scorecard at 有力", () => {
    expect(combineScore(TICKER, surge, { ...base, positiveCatalyst: true, catalystType: "好決算" }).verdict).toBe("strong");
  });
});
