import { NextResponse } from "next/server";

// A cheap gate so signed-out people land on Google instead of an empty page.
// The cookie's signature is verified for real in lib/auth.js, which every
// page and API route goes through — a forged cookie gets nothing.
// /api/setup is guarded by SETUP_TOKEN instead of a session: it has to be
// callable before anyone can sign in.
const OPEN = ["/api/auth/signin", "/api/auth/callback", "/api/auth/signout", "/signed-out", "/api/setup"];

export function middleware(req) {
  const { pathname, origin, search } = req.nextUrl;
  if (OPEN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (req.cookies.get("cfs_session")?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "Not signed in" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  const to = new URL("/api/auth/signin", origin);
  to.searchParams.set("next", pathname + search);
  return NextResponse.redirect(to);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
