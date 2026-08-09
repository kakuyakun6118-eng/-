import { createHmac, timingSafeEqual } from "crypto";

/**
 * Password login, so the app can be put on the internet and reached from a
 * phone without exposing your holdings to anyone who finds the URL.
 *
 * Opt-in: with `APP_PASSWORD` unset nothing is gated, which keeps a purely
 * local setup working as before. Setting it turns on the gate everywhere.
 *
 * The session is a signed expiry timestamp rather than server-side state, so
 * it survives restarts and needs no store. Changing the password (or
 * `SESSION_SECRET`) invalidates every existing session.
 */

export const SESSION_COOKIE = "sa_session";

/** Long enough that a phone stays signed in between uses. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function authPassword(): string | null {
  const value = process.env.APP_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export function isAuthEnabled(): boolean {
  return authPassword() !== null;
}

function secret(): string {
  return process.env.SESSION_SECRET || `derived:${authPassword() ?? ""}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Constant-time compare, so a wrong signature can't be narrowed down by timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSessionToken(now = Date.now()): string {
  const expiresAt = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  if (!safeEqual(signature, sign(expiresAt))) return false;
  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/** Compares a submitted password against the configured one. */
export function passwordMatches(submitted: string): boolean {
  const expected = authPassword();
  return expected !== null && safeEqual(submitted, expected);
}
