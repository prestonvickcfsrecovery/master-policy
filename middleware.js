// Master Policy app — route protection.
//
// PURPOSE: let /api/corpus through the Google sign-in gate. It authenticates
// with CORPUS_TOKEN instead, because the reply tool calls it server-to-server
// during its build and has no browser session to offer.
//
// Everything else behaves as before: no session ⇒ APIs get JSON 401, pages go
// to the signed-out page.

import { NextResponse } from "next/server";

// Where an unauthenticated PAGE request is sent.
const SIGNED_OUT_PATH = "/signed-out";

// The session cookie's name. If your sign-in route sets a different name, every
// request looks signed-out - see the note at the bottom of this file.
const SESSION_COOKIE = "session";

// ── Paths that must work WITHOUT a signed-in user ──────────────────────────
const PUBLIC_PREFIXES = [
  SIGNED_OUT_PATH, // ← the destination itself. Without this it redirects to
                   //   itself forever (ERR_TOO_MANY_REDIRECTS).
  "/api/corpus",   // token-authenticated: the reply tool's policy pull
  "/api/auth",     // the Google OAuth flow - it cannot require a session
  "/api/setup",    // guarded by SETUP_TOKEN, not by a session
];

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

  // 2. Everything else needs a session cookie.
  //    Presence check only - middleware runs on the edge and can't verify the
  //    HMAC. Real verification stays where it already is, in the route handlers
  //    and server components via lib/auth.js. This is a gate, not the lock.
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  // 3. No session: APIs get JSON, pages get sent to the signed-out page.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // BELT AND BRACES: never redirect a request that is already heading to the
  // signed-out page. Step 1 already covers this; this second check means a
  // redirect loop cannot happen even if that list is edited later.
  if (pathname === SIGNED_OUT_PATH || pathname.startsWith(SIGNED_OUT_PATH + "/")) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = SIGNED_OUT_PATH;
  url.search = ""; // no ?next= - it was what made the loop's URL grow each hop
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

// ── IF THE APP STILL LOOKS SIGNED-OUT AFTER THIS ───────────────────────────
// SESSION_COOKIE above is the one value not confirmed against your code. Open
// lib/auth.js and find where the cookie is set on sign-in - something like
// cookies().set("<name>", ...) or a Set-Cookie header - and put that exact name
// in SESSION_COOKIE. That is the only remaining unknown in this file.
