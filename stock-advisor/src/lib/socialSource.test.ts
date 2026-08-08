import { describe, it, expect } from "vitest";
import { extractTickers, normalizeTicker, postsToNewsItems, type SocialPost } from "./socialSource";

const UNIVERSE = ["7203.T", "6758.T", "2025.T"];

describe("normalizeTicker", () => {
  it("appends the .T suffix when missing", () => {
    expect(normalizeTicker("7203")).toBe("7203.T");
  });

  it("leaves an already-suffixed code alone", () => {
    expect(normalizeTicker("7203.T")).toBe("7203.T");
  });

  it("is case-insensitive about the suffix", () => {
    expect(normalizeTicker("7203.t")).toBe("7203.T");
  });
});

describe("extractTickers — marked codes", () => {
  it.each([
    ["7203.T が急騰", "7203.T"],
    ["【7203】に注目", "7203.T"],
    ["トヨタ(7203)は堅調", "7203.T"],
    ["全角括弧（7203）も拾う", "7203.T"],
    ["$7203 を監視", "7203.T"],
    ["#7203 で語ろう", "7203.T"],
    ["証券コード7203", "7203.T"],
    ["銘柄コード: 7203", "7203.T"],
  ])("extracts from %j", (text, expected) => {
    expect(extractTickers(text)).toEqual([expected]);
  });

  it("finds marked codes without needing a known universe", () => {
    expect(extractTickers("【9999】は対象外だが記法で拾える")).toEqual(["9999.T"]);
  });

  it("deduplicates the same code across notations", () => {
    expect(extractTickers("【7203】と 7203.T と $7203")).toEqual(["7203.T"]);
  });
});

describe("extractTickers — bare numbers", () => {
  it("ignores bare numbers when no universe is supplied", () => {
    expect(extractTickers("7203 が上がった")).toEqual([]);
  });

  it("accepts a bare number that is in the user's universe", () => {
    expect(extractTickers("7203 が上がった", UNIVERSE)).toEqual(["7203.T"]);
  });

  it("ignores a bare number outside the universe", () => {
    expect(extractTickers("9999 が上がった", UNIVERSE)).toEqual([]);
  });

  it.each(["2025年の相場", "2025円で約定", "2025株を保有", "2025時点の話", "2025%の上昇", "2025万円の利益"])(
    "rejects a quantity-suffixed number: %j",
    (text) => {
      expect(extractTickers(text, UNIVERSE)).toEqual([]);
    }
  );

  it("still accepts an in-universe code that looks like a year when marked", () => {
    expect(extractTickers("【2025】に注目", UNIVERSE)).toEqual(["2025.T"]);
  });

  it("does not match digits embedded in a longer number", () => {
    expect(extractTickers("株価は72031円", UNIVERSE)).toEqual([]);
    expect(extractTickers("注文番号 123456789", UNIVERSE)).toEqual([]);
  });

  it("handles several codes in one post", () => {
    expect(extractTickers("7203 と 6758 を買った", UNIVERSE).sort()).toEqual(["6758.T", "7203.T"]);
  });
});

describe("postsToNewsItems", () => {
  const posts: SocialPost[] = [
    { handle: "someone", id: "1", text: "7203 に注目", url: "https://x.com/someone/status/1", createdAt: "2026-08-01T00:00:00Z", tickers: ["7203.T"] },
    { handle: "someone", id: "2", text: "6758 の話", url: "https://x.com/someone/status/2", createdAt: "2026-08-02T00:00:00Z", tickers: ["6758.T"] },
  ];

  it("keeps only posts mentioning the given ticker", () => {
    const items = postsToNewsItems("7203.T", posts);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://x.com/someone/status/1");
  });

  it("attributes the source to the account handle", () => {
    expect(postsToNewsItems("7203.T", posts)[0].source).toBe("X @someone");
  });

  it("carries the post text through verbatim as the title", () => {
    expect(postsToNewsItems("7203.T", posts)[0].title).toBe("7203 に注目");
  });

  it("returns nothing for an unmentioned ticker", () => {
    expect(postsToNewsItems("9999.T", posts)).toEqual([]);
  });
});
