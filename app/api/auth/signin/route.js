import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function origin(req) {
  return process.env.APP_URL || new URL(req.url).origin;
}

export async function GET(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("GOOGLE_CLIENT_ID is not set. See README step 3.", { status: 500 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const next = new URL(req.url).searchParams.get("next") || "/";

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", `${origin(req)}/api/auth/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("state", state);
  auth.searchParams.set("prompt", "select_account");
  if (process.env.ALLOWED_DOMAINS) {
    auth.searchParams.set("hd", process.env.ALLOWED_DOMAINS.split(",")[0].trim());
  }

  const res = NextResponse.redirect(auth.toString());
  res.cookies.set("cfs_oauth_state", `${state}|${next}`, {
    httpOnly: true, sameSite: "lax", secure: origin(req).startsWith("https"), path: "/", maxAge: 600,
  });
  return res;
}
