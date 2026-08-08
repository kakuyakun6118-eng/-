import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { recordFailure, recentIssues, describeIssue, clearIssues } from "./dataHealth";

beforeEach(() => clearIssues());
afterEach(() => vi.useRealTimers());

describe("recordFailure / recentIssues", () => {
  it("reports nothing when everything is healthy", () => {
    expect(recentIssues()).toEqual([]);
  });

  it("reports a failure that just happened", () => {
    recordFailure("prices", new Error("connect ECONNREFUSED"));
    const issues = recentIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].source).toBe("prices");
    expect(issues[0].message).toBe("connect ECONNREFUSED");
  });

  it("collapses repeats from one source into a single entry", () => {
    recordFailure("prices", new Error("boom"));
    recordFailure("prices", new Error("boom"));
    recordFailure("prices", new Error("boom"));
    const issues = recentIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].count).toBe(3);
  });

  it("keeps different sources separate", () => {
    recordFailure("prices", new Error("a"));
    recordFailure("news", new Error("b"));
    expect(recentIssues().map((i) => i.source).sort()).toEqual(["news", "prices"]);
  });

  it("accepts a non-Error value", () => {
    recordFailure("llm", "plain string failure");
    expect(recentIssues()[0].message).toBe("plain string failure");
  });

  it("stops reporting once the failure is old", () => {
    vi.useFakeTimers();
    recordFailure("social", new Error("rate limited"));
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(recentIssues()).toEqual([]);
  });

  it("restarts the count after the window lapses", () => {
    vi.useFakeTimers();
    recordFailure("prices", new Error("a"));
    recordFailure("prices", new Error("a"));
    vi.advanceTimersByTime(5 * 60_000 + 1);
    recordFailure("prices", new Error("a"));
    expect(recentIssues()[0].count).toBe(1);
  });
});

describe("describeIssue", () => {
  it("names the source in Japanese and includes the error", () => {
    recordFailure("prices", new Error("HTTP 403"));
    expect(describeIssue(recentIssues()[0])).toContain("株価データ");
    expect(describeIssue(recentIssues()[0])).toContain("HTTP 403");
  });

  it("mentions the repeat count only when there is more than one", () => {
    recordFailure("news", new Error("x"));
    expect(describeIssue(recentIssues()[0])).not.toContain("直近");
    recordFailure("news", new Error("x"));
    expect(describeIssue(recentIssues()[0])).toContain("直近2件");
  });
});
