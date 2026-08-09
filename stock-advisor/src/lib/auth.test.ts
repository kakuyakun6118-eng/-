import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionToken, verifySessionToken, passwordMatches, isAuthEnabled, SESSION_MAX_AGE_SECONDS } from "./auth";

const original = { ...process.env };

beforeEach(() => {
  process.env.APP_PASSWORD = "correct horse";
  delete process.env.SESSION_SECRET;
});
afterEach(() => {
  process.env = { ...original };
});

describe("isAuthEnabled", () => {
  it("is off when no password is configured", () => {
    delete process.env.APP_PASSWORD;
    expect(isAuthEnabled()).toBe(false);
  });

  it("treats an empty password as off, not as an empty valid password", () => {
    process.env.APP_PASSWORD = "";
    expect(isAuthEnabled()).toBe(false);
  });

  it("is on once a password is set", () => {
    expect(isAuthEnabled()).toBe(true);
  });
});

describe("passwordMatches", () => {
  it("accepts the configured password", () => {
    expect(passwordMatches("correct horse")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(passwordMatches("wrong horse")).toBe(false);
  });

  it("rejects a prefix of the password", () => {
    expect(passwordMatches("correct")).toBe(false);
  });

  it("rejects everything when auth is off", () => {
    delete process.env.APP_PASSWORD;
    expect(passwordMatches("")).toBe(false);
    expect(passwordMatches("anything")).toBe(false);
  });
});

describe("session tokens", () => {
  it("accepts a token it just issued", () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it("rejects a missing token", () => {
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifySessionToken("garbage")).toBe(false);
    expect(verifySessionToken("123.")).toBe(false);
    expect(verifySessionToken(".abc")).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const token = createSessionToken();
    const [, signature] = token.split(".");
    const farFuture = String(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(`${farFuture}.${signature}`)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const [expiry] = createSessionToken().split(".");
    expect(verifySessionToken(`${expiry}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBe(false);
  });

  it("expires after its lifetime", () => {
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now + SESSION_MAX_AGE_SECONDS * 1000 - 1000)).toBe(true);
    expect(verifySessionToken(token, now + SESSION_MAX_AGE_SECONDS * 1000 + 1000)).toBe(false);
  });

  it("invalidates existing sessions when the password changes", () => {
    const token = createSessionToken();
    process.env.APP_PASSWORD = "a different password";
    expect(verifySessionToken(token)).toBe(false);
  });

  it("uses SESSION_SECRET when provided, so sessions survive a password change", () => {
    process.env.SESSION_SECRET = "a-stable-secret";
    const token = createSessionToken();
    process.env.APP_PASSWORD = "a different password";
    expect(verifySessionToken(token)).toBe(true);
  });
});
