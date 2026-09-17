import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireUser(); } catch (res) { return res; }
  try {
    const proposals = await q(
      `SELECT p.*, e.code AS entry_code, e.title AS entry_title, e.version AS entry_version
       FROM proposals p JOIN entries e ON e.id = p.entry_id
       ORDER BY p.created_at DESC`
    );
    const comments = await q(
      `SELECT id, proposal_id, author_name, author_email, text, created_at
       FROM comments ORDER BY created_at ASC`
    );
    return NextResponse.json({ proposals, comments });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e), proposals: [], comments: [] }, { status: 500 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireUser(); } catch (res) { return res; }
  const b = await req.json().catch(() => ({}));
  const title = (b.title || "").trim();
  const entryId = (b.entryId || "").trim();
  if (!title || !entryId) {
    return NextResponse.json({ error: "A title and an entry are required." }, { status: 400 });
  }
  const rows = await q(
    `INSERT INTO proposals (entry_id, title, type, proposed_text, rationale, urgency, author_email, author_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [entryId, title.slice(0, 300), (b.type || "Change to existing guidance").slice(0, 80),
     (b.proposedText || "").slice(0, 60000), (b.rationale || "").slice(0, 8000),
     (b.urgency || "Routine").slice(0, 40), user.email, user.name]
  );
  return NextResponse.json({ ok: true, id: rows[0].id });
}
