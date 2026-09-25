// Master Policy app — route protection.
//
// WHAT THIS DOES: lets /api/corpus through the Google sign-in gate. That
// endpoint authenticates with CORPUS_TOKEN instead, because the reply tool
// calls it server-to-server during its build and has no browser session.
// Everything else behaves as it did before.
//
// The two constants below are no longer guesses - both are taken from the
// app's own code:
//   SESSION_COOKIE  = "cfs_session"  →  lib/auth.js, `const COOKIE = "cfs_session"`
//   SIGNED_OUT_PATH = "/signed-out"  →  app/signed-out/page.jsx
//
// Safety note: this middleware is a gate, not the lock. Real enforcement lives
// where it always did - requireUser() and currentUser() in lib/auth.js, called
// from the route handlers and server components. Those verify the HMAC
// signature, check expiry, and check ALLOWED_DOMAINS / ALLOWED_EMAILS. Edge
// middleware can't do any of that, so it only checks the cookie is present.

import { NextResponse } from "next/server";

// From lib/auth.js: `const COOKIE = "cfs_session"` (exported as SESSION_COOKIE).
const SESSION_COOKIE = "cfs_session";

// The page an unauthenticated visitor is sent to. It carries the
// "Sign in with Google" button.
const SIGNED_OUT_PATH = "/signed-out";

// ── Paths that must work WITHOUT a signed-in user ──────────────────────────
const PUBLIC_PREFIXES = [
  SIGNED_OUT_PATH, // the destination itself - without this it redirects to
                   // itself forever (ERR_TOO_MANY_REDIRECTS)
  "/api/corpus",   // token-authenticated: the reply tool's policy pull
  "/api/auth",     // the Google OAuth flow - it cannot require a session
  "/api/setup",    // guarded by SETUP_TOKEN, not by a session
];

// Next.js internals and static assets never need a session.
const ASSET_RE = /^\/(_next|favicon\.ico|icon\.svg|robots\.txt|sitemap\.xml|.*\.(png|jpg|jpeg|svg|ico|webp|css|js|woff2?|txt))$/;

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // 1. Public paths and static assets pass straight through.
  if (
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    ASSET_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Everything else needs the session cookie to be present.
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // 3. No session: API routes get JSON, pages go to the signed-out page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Second guard against a redirect loop. Step 1 already covers this; this
  // makes a loop impossible even if the list above is edited later.
  if (pathname === SIGNED_OUT_PATH || pathname.startsWith(SIGNED_OUT_PATH + "/")) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = SIGNED_OUT_PATH;
  url.search = ""; // no ?next= - that was what made the looping URL grow
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
