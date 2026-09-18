import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "cfs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

/** Sign a small JSON payload into a tamper-evident cookie value. */
export function signSession(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE * 1000 }));
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(value) {
  if (!value || typeof value !== "string" || !value.includes(".")) return null;
  const [body, mac] = value.split(".");
  let expected;
  try {
    expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function list(name) {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Who is allowed in at all. An empty ALLOWED_DOMAINS + ALLOWED_EMAILS locks everyone out on purpose. */
export function isAllowed(email) {
  const e = (email || "").toLowerCase();
  if (!e) return false;
  const domains = list("ALLOWED_DOMAINS");
  const emails = list("ALLOWED_EMAILS");
  if (emails.includes(e)) return true;
  const domain = e.split("@")[1];
  return !!domain && domains.includes(domain);
}

/** Review Board members may approve and decline; everyone else proposes and comments. */
export function isBoard(email) {
  return list("BOARD_EMAILS").includes((email || "").toLowerCase());
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

/** The signed-in person, or null. Use inside route handlers and server components. */
export async function currentUser() {
  const jar = await cookies();
  const data = verifySession(jar.get(COOKIE)?.value);
  if (!data || !isAllowed(data.email)) return null;
  return {
    email: data.email,
    name: data.name || data.email,
    picture: data.picture || "",
    isBoard: isBoard(data.email),
  };
}

/** For API routes: returns the user or throws a 401 Response. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}
