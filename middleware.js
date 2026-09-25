// Master Policy app — route protection.
//
// WHAT CHANGED: /api/corpus is now exempt from the Google sign-in gate. It
// authenticates with CORPUS_TOKEN instead, because the reply tool calls it
// server-to-server during its build and has no browser session to offer.
// Without this exemption it always gets {"error":"Not signed in"}.
//
// ⚠ BEFORE YOU COMMIT: two values below are marked CHECK. Compare them against
// your current middleware.js. If either differs, use yours — getting them wrong
// locks your team out of the app.

import { NextResponse } from "next/server";

// ── Paths that must work WITHOUT a signed-in user ──────────────────────────
const PUBLIC_PREFIXES = [
  "/api/corpus",   // token-authenticated: the reply tool's policy pull
  "/api/auth",     // the Google OAuth flow itself - it cannot require a session
  "/api/setup",    // guarded by SETUP_TOKEN, not by a session
];

// Next.js internals and static assets never need a session.
const ASSET_RE = /^\/(_next|favicon\.ico|robots\.txt|sitemap\.xml|.*\.(png|jpg|jpeg|svg|ico|webp|css|js|woff2?|txt))$/;

// CHECK #1 — the session cookie's name. Whatever your sign-in route sets.
// Common values: "session", "auth", "sid", "mp_session".
const SESSION_COOKIE = "session";

// CHECK #2 — where an unauthenticated PAGE request gets sent to sign in.
// If your app starts the Google flow at a different path, use that path.
const LOGIN_PATH = "/signed-out";

export function middleware(req) {
  const { pathname, search } = req.nextUrl;

  // 1. Always let the public paths through, untouched.
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) || ASSET_RE.test(pathname)) {
    return NextResponse.next();
  }

  // 2. Everything else needs a session cookie.
  //    Middleware runs on the edge and cannot verify the HMAC signature (that
  //    needs node crypto), so this is a presence check only. The real
  //    verification stays where it already is - in the route handlers and
  //    server components, via lib/auth.js. This is a gate, not the lock.
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  // 3. No session. API routes get JSON; pages get sent to sign in.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  // remember where they were headed so sign-in can return them there
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next.js internals. The exemptions above do the
  // real filtering, so this stays broad and there's only one list to maintain.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
