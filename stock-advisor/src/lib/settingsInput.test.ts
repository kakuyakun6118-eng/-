import { describe, it, expect } from "vitest";
import { normalizeTickerInput } from "./watchlist";

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

