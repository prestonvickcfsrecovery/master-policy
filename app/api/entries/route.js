import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch (res) { return res; }
  try {
    const rows = await q(
      `SELECT id, code, title, summary, body, section, ord, zone, status,
              review_refs, source_note, version, updated_at, updated_by
       FROM entries ORDER BY ord ASC`
    );
    return NextResponse.json({ entries: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e), entries: [] }, { status: 500 });
  }
}
