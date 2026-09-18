import { NextResponse } from "next/server";
import { signSession, isAllowed, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

function origin(req) {
  return process.env.APP_URL || new URL(req.url).origin;
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = req.cookies.get("cfs_oauth_state")?.value || "";
  const [wanted, next] = cookie.split("|");

  if (!code || !state || !wanted || state !== wanted) {
    return NextResponse.redirect(`${origin(req)}/signed-out?error=state`);
  }

  // Exchange the one-time code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: `${origin(req)}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin(req)}/signed-out?error=token`);
  }
  const tokens = await tokenRes.json();

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) {
    return NextResponse.redirect(`${origin(req)}/signed-out?error=userinfo`);
  }
  const info = await infoRes.json();

  if (!info.email_verified || !isAllowed(info.email)) {
    return NextResponse.redirect(`${origin(req)}/signed-out?error=denied`);
  }

  const res = NextResponse.redirect(`${origin(req)}${next && next.startsWith("/") ? next : "/"}`);
  res.cookies.set(SESSION_COOKIE, signSession({
    email: info.email.toLowerCase(),
    name: info.name || info.email,
    picture: info.picture || "",
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin(req).startsWith("https"),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.delete("cfs_oauth_state");
  return res;
}
