import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Put an earlier version of a policy back in force. Owner only.
 * The version being replaced is kept, so a restore is itself reversible.
 */
export async function POST(req, { params }) {
  let user;
  try { user = await requireUser(); } catch (res) { return res; }
  if (!user.isBoard) {
    return NextResponse.json({ error: "Only the policy owner can restore a version." }, { status: 403 });
  }

  const { id } = await params;
  const { version } = await req.json().catch(() => ({}));
  if (!version) return NextResponse.json({ error: "Which version?" }, { status: 400 });

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const { rows: er } = await client.query(
      `SELECT body, version, status FROM entries WHERE id = $1 FOR UPDATE`, [id]
    );
    if (!er.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No such policy." }, { status: 404 });
    }
    const { rows: vr } = await client.query(
      `SELECT body FROM entry_versions WHERE entry_id = $1 AND version = $2`, [id, Number(version)]
    );
    if (!vr.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No such version." }, { status: 404 });
    }

    const entry = er[0];
    await client.query(
      `INSERT INTO entry_versions (entry_id, version, body, status, changed_by, note)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (entry_id, version) DO NOTHING`,
      [id, entry.version, entry.body, entry.status, user.email, "Replaced by a restore"]
    );
    const next = entry.version + 1;
    await client.query(
      `UPDATE entries SET body = $1, version = $2, updated_at = now(), updated_by = $3 WHERE id = $4`,
      [vr[0].body, next, user.email, id]
    );
    await client.query(
      `INSERT INTO entry_versions (entry_id, version, body, status, changed_by, note)
       VALUES ($1,$2,$3,'approved',$4,$5) ON CONFLICT (entry_id, version) DO NOTHING`,
      [id, next, vr[0].body, user.email, `Restored from v${version}`]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, version: next });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
