import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  try { await requireUser(); } catch (res) { return res; }
  const { id } = await params;
  const rows = await q(
    `SELECT version, body, status, changed_at, changed_by, proposal_id, note
     FROM entry_versions WHERE entry_id = $1 ORDER BY version DESC`, [id]
  );
  return NextResponse.json({ history: rows });
}
