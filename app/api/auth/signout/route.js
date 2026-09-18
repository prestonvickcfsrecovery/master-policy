import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const res = NextResponse.redirect(`${base}/signed-out`);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
