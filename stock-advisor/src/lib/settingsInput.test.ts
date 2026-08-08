import { describe, it, expect } from "vitest";
import { normalizeTickerInput } from "./watchlist";
import { normalizeHandleInput } from "./watchedAccounts";

describe("normalizeTickerInput", () => {
  it.each([
    ["7203", "7203.T"],
    ["7203.T", "7203.T"],
    ["7203.t", "7203.T"],
    ["  7203  ", "7203.T"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeTickerInput(input)).toBe(expected);
  });

  it("accepts the alphanumeric codes issued since 2024", () => {
    expect(normalizeTickerInput("130A")).toBe("130A.T");
  });

  it("upper-cases a lowercase alphanumeric code", () => {
    expect(normalizeTickerInput("130a")).toBe("130A.T");
  });

  it.each([["【7203】", "7203.T"], ["(7203)", "7203.T"], ["（7203）", "7203.T"]])(
    "strips the brackets used in Japanese posts: %j",
    (input, expected) => {
      expect(normalizeTickerInput(input)).toBe(expected);
    }
  );

  it.each(["", "72", "72031", "abcd", "トヨタ", "A123"])("rejects %j", (input) => {
    expect(normalizeTickerInput(input)).toBeNull();
  });
});

describe("normalizeHandleInput", () => {
  it.each([
    ["aleabitoreddit", "aleabitoreddit"],
    ["@aleabitoreddit", "aleabitoreddit"],
    ["  @aleabitoreddit  ", "aleabitoreddit"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeHandleInput(input)).toBe(expected);
  });

  it.each([
    "https://x.com/aleabitoreddit",
    "https://www.x.com/aleabitoreddit",
    "https://twitter.com/aleabitoreddit",
    "http://x.com/aleabitoreddit",
  ])("accepts a pasted profile URL: %j", (input) => {
    expect(normalizeHandleInput(input)).toBe("aleabitoreddit");
  });

  it("drops a trailing path or query from a pasted URL", () => {
    expect(normalizeHandleInput("https://x.com/aleabitoreddit/status/123")).toBe("aleabitoreddit");
    expect(normalizeHandleInput("https://x.com/aleabitoreddit?ref=foo")).toBe("aleabitoreddit");
  });

  it("keeps underscores and digits", () => {
    expect(normalizeHandleInput("@user_123")).toBe("user_123");
  });

  it.each(["", "@", "has spaces", "way_too_long_handle_here", "bad-hyphen", "日本語"])("rejects %j", (input) => {
    expect(normalizeHandleInput(input)).toBeNull();
  });

  it("accepts a handle at the 15-character limit", () => {
    expect(normalizeHandleInput("a".repeat(15))).toBe("a".repeat(15));
  });

  it("rejects a handle one character over the limit", () => {
    expect(normalizeHandleInput("a".repeat(16))).toBeNull();
  });
});
