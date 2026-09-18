import { NextResponse } from "next/server";
import { db, migrate } from "@/lib/db";
import curriculum from "@/data/policy.json";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-time (and safely repeatable) setup: create the tables and load the
 * curriculum. Guarded by SETUP_TOKEN so a stranger can't call it.
 * Existing entries are left alone unless ?overwrite=1, so re-running this
 * never wipes approved edits the team has made.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const tokenOk = !!process.env.SETUP_TOKEN && token === process.env.SETUP_TOKEN;
  // Once SETUP_TOKEN is deleted, a signed-in policy owner can still run this to
  // apply later database changes. Loading entries stays skip-by-default either way.
  const user = tokenOk ? null : await currentUser();
  if (!tokenOk && !(user && user.isBoard)) {
    return NextResponse.json(
      { error: "Bad or missing setup token, and you are not signed in as a policy owner." },
      { status: 403 }
    );
  }
  const overwrite = url.searchParams.get("overwrite") === "1";

  try {
    await migrate();
    const client = await db().connect();
    let inserted = 0, updated = 0, skipped = 0;
    try {
      for (const e of curriculum) {
        const { rows } = await client.query(`SELECT version FROM entries WHERE id = $1`, [e.id]);
        if (rows.length && !overwrite) { skipped++; continue; }
        if (rows.length) {
          await client.query(
            `UPDATE entries SET code=$2,title=$3,summary=$4,body=$5,section=$6,ord=$7,zone=$8,
                    status=$9,review_refs=$10,source_note=$11,updated_at=now()
             WHERE id=$1`,
            [e.id, e.code, e.title, e.summary, e.body, e.section, e.order, e.zone,
             e.status, JSON.stringify(e.reviewRefs || []), e.sourceNote || ""]
          );
          updated++;
        } else {
          await client.query(
            `INSERT INTO entries (id,code,title,summary,body,section,ord,zone,status,review_refs,source_note,version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)`,
            [e.id, e.code, e.title, e.summary, e.body, e.section, e.order, e.zone,
             e.status, JSON.stringify(e.reviewRefs || []), e.sourceNote || ""]
          );
          await client.query(
            `INSERT INTO entry_versions (entry_id,version,body,status,changed_by,note)
             VALUES ($1,1,$2,$3,'setup','Loaded from Master Program Policy v3.6')`,
            [e.id, e.body, e.status]
          );
          inserted++;
        }
      }
    } finally { client.release(); }
    return NextResponse.json({ ok: true, inserted, updated, skipped, total: curriculum.length });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
