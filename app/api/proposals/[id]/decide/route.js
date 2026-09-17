import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Approve or decline a proposal. Only Review Board members get here.
 * Approving with proposed wording publishes it to the entry, bumps the
 * version, and keeps the superseded wording in entry_versions.
 * All of it in one transaction so a half-applied decision is impossible.
 */
export async function POST(req, { params }) {
  let user;
  try { user = await requireUser(); } catch (res) { return res; }
  if (!user.isBoard) {
    return NextResponse.json({ error: "Only the policy owner can decide proposals." }, { status: 403 });
  }

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const approve = b.approve === true;
  const note = (b.note || "").trim().slice(0, 2000);

  const client = await db().connect();
  try {
    await client.query("BEGIN");

    const { rows: pr } = await client.query(
      `SELECT * FROM proposals WHERE id = $1 FOR UPDATE`, [Number(id)]
    );
    if (!pr.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "That proposal no longer exists." }, { status: 404 });
    }
    const p = pr[0];
    if (p.status !== "open") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Already ${p.status}.` }, { status: 409 });
    }

    let applied = 0;
    if (approve && p.proposed_text && p.proposed_text.trim()) {
      const { rows: er } = await client.query(
        `SELECT body, version, status FROM entries WHERE id = $1 FOR UPDATE`, [p.entry_id]
      );
      if (er.length) {
        const entry = er[0];

        // Keep the wording being replaced, so the change is reversible.
        await client.query(
          `INSERT INTO entry_versions (entry_id, version, body, status, changed_by, proposal_id, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (entry_id, version) DO NOTHING`,
          [p.entry_id, entry.version, entry.body, entry.status, p.author_email, p.id,
           "Superseded by proposal #" + p.id]
        );

        applied = entry.version + 1;
        await client.query(
          `UPDATE entries
             SET body = $1, version = $2, status = 'approved',
                 updated_at = now(), updated_by = $3
           WHERE id = $4`,
          [p.proposed_text, applied, user.email, p.entry_id]
        );

        await client.query(
          `INSERT INTO entry_versions (entry_id, version, body, status, changed_by, proposal_id, note)
           VALUES ($1,$2,$3,'approved',$4,$5,$6)
           ON CONFLICT (entry_id, version) DO NOTHING`,
          [p.entry_id, applied, p.proposed_text, user.email, p.id,
           note || ("Approved: " + p.title)]
        );
      }
    }

    await client.query(
      `UPDATE proposals
         SET status = $1, decided_by = $2, decided_at = now(),
             decision_note = $3, applied_version = $4
       WHERE id = $5`,
      [approve ? "approved" : "declined", user.email, note, applied, p.id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, appliedVersion: applied });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  } finally {
    client.release();
  }
}
