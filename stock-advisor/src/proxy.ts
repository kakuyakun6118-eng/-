import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Guards the API surface. Two separate concerns:
 *
 * 1. **Cross-site writes** — a browser will happily POST to `localhost:3000`
 *    from any page on the internet. Every mutating route is same-origin by
 *    design, so a request carrying a foreign `Origin` is rejected outright.
 *
 * 2. **Automation endpoints** — `/api/notify` and `/api/history/record` are
 *    meant to be hit by cron, spend money (LLM and X quota) and send messages.
 *    When `APP_TOKEN` is set they require it.
 *
 * This is deliberately *not* a login system. The token cannot protect the
 * browser UI: the page's own fetches would have to carry it, which would put
 * it in client-side JavaScript for anyone to read. Guarding the UI needs real
 * sessions — until then, keep the app bound to localhost.
 *
 * Kept dependency-free because proxy runs in its own runtime and should not
 * rely on shared modules.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes intended for cron rather than the UI. */
const AUTOMATION_PATHS = ["/api/notify", "/api/history/record"];

function isCrossSite(request: NextRequest): boolean {
  // Browsers that send it: trust the explicit signal first.
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  const origin = request.headers.get("origin");
  if (!origin) return false; // curl and other non-browser clients send neither.
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

function hasValidToken(request: NextRequest, expected: string): boolean {
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return (bearer ?? request.headers.get("x-app-token")) === expected;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (MUTATING_METHODS.has(request.method) && isCrossSite(request)) {
    return NextResponse.json({ error: "クロスサイトからの書き込みは許可されていません" }, { status: 403 });
  }

  const expected = process.env.APP_TOKEN;
  if (expected && AUTOMATION_PATHS.some((p) => pathname.startsWith(p)) && !hasValidToken(request, expected)) {
    return NextResponse.json({ error: "APP_TOKEN が一致しません" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
