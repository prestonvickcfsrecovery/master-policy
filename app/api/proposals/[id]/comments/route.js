import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  let user;
  try { user = await requireUser(); } catch (res) { return res; }
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const text = (b.text || "").trim();
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  await q(
    `INSERT INTO comments (proposal_id, author_email, author_name, text) VALUES ($1,$2,$3,$4)`,
    [Number(id), user.email, user.name, text.slice(0, 5000)]
  );
  return NextResponse.json({ ok: true });
}
