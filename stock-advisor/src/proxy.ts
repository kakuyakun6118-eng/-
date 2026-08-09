import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, verifySessionToken } from "@/lib/auth";

/**
 * Guards the app. Three separate concerns:
 *
 * 1. **Password login** — when `APP_PASSWORD` is set, every page and API route
 *    needs a valid session cookie. This is what makes it safe to host the app
 *    somewhere reachable from a phone. Unset, nothing is gated, so a purely
 *    local setup behaves as before.
 *
 * 2. **Cross-site writes** — a browser will happily POST to `localhost:3000`
 *    from any page on the internet. Every mutating route is same-origin by
 *    design, so a request carrying a foreign `Origin` is rejected outright.
 *
 * 3. **Automation endpoints** — `/api/notify` and `/api/history/record` are
 *    meant to be hit by cron, which cannot log in. They accept `APP_TOKEN`
 *    instead of a session.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes intended for cron rather than the UI. */
const AUTOMATION_PATHS = ["/api/notify", "/api/history/record"];

/** Reachable without a session, or you could never sign in. */
const PUBLIC_PATHS = ["/login", "/api/login"];

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

  const appToken = process.env.APP_TOKEN;
  const isAutomation = AUTOMATION_PATHS.some((p) => pathname.startsWith(p));

  if (isAutomation) {
    // Cron authenticates with the token; a browser session also works so the
    // "今日の判定を記録" button keeps functioning.
    if (appToken && !hasValidToken(request, appToken) && !verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
      return NextResponse.json({ error: "APP_TOKEN が一致しません" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isAuthEnabled() && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (!verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
      }
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the icons, which must stay
  // reachable for the login page and the home-screen install to render.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest).*)"],
};
