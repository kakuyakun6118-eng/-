import { describe, it, expect } from "vitest";
import { isOnCooldown, recordSends, COOLDOWN_MS, type NotifyLog } from "./notifyStore";

const NOW = new Date("2026-08-08T12:00:00Z").getTime();

describe("isOnCooldown", () => {
  it("is false for a key that has never been sent", () => {
    expect(isOnCooldown({}, "k", NOW)).toBe(false);
  });

  it("is true just after a send", () => {
    expect(isOnCooldown({ k: NOW - 1000 }, "k", NOW)).toBe(true);
  });

  it("expires once the cooldown has passed", () => {
    expect(isOnCooldown({ k: NOW - COOLDOWN_MS - 1 }, "k", NOW)).toBe(false);
  });

  it("treats each key independently", () => {
    const log: NotifyLog = { a: NOW };
    expect(isOnCooldown(log, "a", NOW)).toBe(true);
    expect(isOnCooldown(log, "b", NOW)).toBe(false);
  });
});

describe("recordSends", () => {
  it("stamps the sent keys with the current time", () => {
    expect(recordSends({}, ["a", "b"], NOW)).toEqual({ a: NOW, b: NOW });
  });

  it("refreshes a key that was already present", () => {
    expect(recordSends({ a: NOW - 5000 }, ["a"], NOW).a).toBe(NOW);
  });

  it("keeps entries that are still within the retention window", () => {
    expect(recordSends({ old: NOW - COOLDOWN_MS }, [], NOW)).toHaveProperty("old");
  });

  it("prunes entries far past their cooldown", () => {
    expect(recordSends({ ancient: NOW - COOLDOWN_MS * 3 }, [], NOW)).not.toHaveProperty("ancient");
  });

  it("does not mutate the log it was given", () => {
    const log: NotifyLog = { a: NOW - 1000 };
    recordSends(log, ["b"], NOW);
    expect(log).toEqual({ a: NOW - 1000 });
  });

  it("suppresses a repeat send but allows one the next day", () => {
    const afterSend = recordSends({}, ["alert"], NOW);
    expect(isOnCooldown(afterSend, "alert", NOW + 60_000)).toBe(true);
    expect(isOnCooldown(afterSend, "alert", NOW + COOLDOWN_MS + 1)).toBe(false);
  });
});
