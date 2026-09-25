// PUBLISH ENDPOINT — Master Program Policy → Customer Support Reply Bot
//
// Drop this file into the master-policy app at app/api/corpus/route.js.
// It is entirely self-contained: it opens its own database connection and does
// NOT import lib/db.js, so nothing else in the policy app has to change.
//
//   GET /api/corpus?token=...          full corpus (entries + quickref + version)
//   GET /api/corpus?token=...&meta=1   just {version, count, updated_at} - cheap
//
// The reply tool calls this during its build, re-embeds the policy, and ships it.
// `version` is a content hash: identical content = identical version, so the
// reply tool can tell "nothing changed" without downloading everything.
//
// ENV REQUIRED:  CORPUS_TOKEN  (any long random string; the reply tool sends it)
// ENV USED:      DATABASE_URL / POSTGRES_URL  (already set by the Neon integration)

import { Pool } from "pg";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Neon integration sets several of these; whichever exists is used. If only
// the PG* pieces are present, the string is assembled from them.
function connectionString() {
  const direct =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED;
  if (direct) return direct;
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const auth = `${encodeURIComponent(PGUSER)}${PGPASSWORD ? `:${encodeURIComponent(PGPASSWORD)}` : ""}`;
    return `postgresql://${auth}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}?sslmode=require`;
  }
  return null;
}
const CONN = connectionString();

let pool;
function db() {
  if (!pool) pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false }, max: 2 });
  return pool;
}

// The reply tool's policy file uses {code, title, program, text}. The policy app's
// column names are read defensively (body/content/text, section/program/category)
// so this keeps working if the schema is named slightly differently.
const pick = (row, ...names) => {
  for (const n of names) {
    const v = row[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

function toEntry(row) {
  const summary = pick(row, "summary", "excerpt", "description");
  const body = pick(row, "body", "content", "text", "markdown");
  // summary first, then body - matches how the baked file reads
  const text = [summary, body].filter(Boolean).join("\n\n");
  return {
    code: pick(row, "code", "ref", "slug").toUpperCase(),
    title: pick(row, "title", "name", "heading"),
    program: pick(row, "program", "section", "category", "group"),
    text,
    updated_at: row.updated_at || row.updatedAt || row.created_at || null,
  };
}

function hashCorpus(entries) {
  const canonical = entries
    .map((e) => `${e.code}\u0000${e.title}\u0000${e.program}\u0000${e.text}`)
    .join("\u0001");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// Quick Reference cards are the prompt's at-a-glance card AND the source of the
// reply bot's allowed-price list, so they're published separately.
const QUICKREF_RE = /quick.?ref/i;
function buildQuickref(entries) {
  const cards = entries.filter((e) => QUICKREF_RE.test(e.program) || QUICKREF_RE.test(e.title) || /^Q/i.test(e.code));
  if (!cards.length) return null;
  return cards.map((e) => `${e.title}\n${e.text}`).join("\n\n---\n\n");
}

export async function GET(req) {
  const url = new URL(req.url);
  // .trim() on both sides on purpose. Pasting a value into Vercel's box very
  // often carries a trailing newline or space, which made a correct token fail
  // with a bare "Bad token" and nothing to go on.
  const token = (url.searchParams.get("token") || req.headers.get("x-corpus-token") || "").trim();
  // CORPUS_TOKEN is the name to use if you link ONE Vercel shared variable to both
  // projects; POLICY_CORPUS_TOKEN is accepted so either naming works.
  const expectedRaw = process.env.CORPUS_TOKEN || process.env.POLICY_CORPUS_TOKEN || "";
  const expected = expectedRaw.trim();

  if (!expected) {
    // Env vars are injected at DEPLOY time, so setting one does not affect the
    // deployment already serving this URL. That is nearly always what's wrong
    // here, so say it plainly and show what this deployment can actually see.
    return Response.json(
      {
        error: "CORPUS_TOKEN is not visible to this deployment.",
        most_likely_cause:
          "The variable was added or changed after this deployment was built. Vercel injects environment variables at build time, so you need to redeploy: Deployments → the latest one → ⋯ → Redeploy.",
        also_check:
          process.env.VERCEL_ENV === "production"
            ? ["You are on the production deployment, so scope is not the problem - a redeploy is what's needed."]
            : [
                `You are on a "${process.env.VERCEL_ENV || "unknown"}" deployment, not production. The variable is scoped to Production only, so it is not present here.`,
                "Either test the production domain, or enable the variable for this environment as well.",
              ],
        this_deployment: {
          environment: process.env.VERCEL_ENV || null,
          commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
          commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
          url: process.env.VERCEL_URL || null,
        },
        // names only, never values - tells you whether ANY token reached the build
        corpus_vars_this_deployment_can_see: ["CORPUS_TOKEN", "POLICY_CORPUS_TOKEN"].filter((k) => !!process.env[k]),
        database_connection_detected: !!CONN,
      },
      { status: 503 }
    );
  }
  // constant-time compare so the token can't be guessed a character at a time
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // Lengths and a first/last-character fingerprint only - never the token
    // itself, and only when a token was actually supplied.
    const fp = (s) => (s.length >= 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : "(too short)");
    return Response.json(
      {
        error: "Bad token",
        ...(token
          ? {
              why: a.length !== b.length
                ? "The token in your URL and the one stored in CORPUS_TOKEN are different lengths, so they are not the same value."
                : "Same length, different characters - the values don't match.",
              sent: { length: a.length, looks_like: fp(token) },
              stored: { length: b.length, looks_like: fp(expected), had_surrounding_whitespace: expectedRaw !== expectedRaw.trim() },
              fix: a.length !== b.length
                ? "Re-copy the value into Vercel → Settings → Environment Variables → CORPUS_TOKEN (make sure nothing is cut off and no extra characters are pasted), then REDEPLOY. Remember a redeploy is required for the new value to take effect."
                : "Re-copy the value into both places, then redeploy.",
            }
          : { why: "No token was supplied. Add ?token=... to the URL." }),
      },
      { status: 401 }
    );
  }
  if (!CONN) {
    return Response.json({ error: "No database connection string in the environment." }, { status: 503 });
  }

  try {
    const { rows } = await db().query("select * from entries");
    // archived/deleted rows are excluded if the app has such a column.
    // Filter on the RAW rows first, so nothing depends on index alignment.
    const live = rows.filter((r) => !(r.archived === true || r.deleted === true || r.status === "archived"));
    const entries = live
      .map(toEntry)
      .filter((e) => e.code && e.text)
      .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));

    const version = hashCorpus(entries);
    const updated_at = live
      .map((r) => r.updated_at || r.created_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

    if (url.searchParams.get("meta")) {
      return Response.json({ version, count: entries.length, updated_at });
    }

    return Response.json({
      version,
      count: entries.length,
      updated_at,
      generated_at: new Date().toISOString(),
      source: "master-policy",
      entries,
      quickref: buildQuickref(entries),
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
