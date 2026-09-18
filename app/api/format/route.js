import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Tidy a pasted draft into the house format so an approved policy looks like
 * every other policy: ### headings, bullets, and pipe tables. Wording is kept;
 * only the layout changes.
 */
const RULES = `You format CFS Recovery policy text. You are given a draft policy and you return the same policy, reformatted.

Rules:
- Keep the author's wording, figures, and meaning exactly. Do not add, remove, soften, or invent any rule, price, deadline, or owner.
- Use "### " for section headings.
- Use "- " for bullet lists and "1. " for ordered steps.
- Turn anything tabular into a markdown pipe table: a header row, then |---|---| , then one row per line.
- Use **bold** for the label at the start of a bullet where it helps scanning.
- Do not add a title at the top; the policy's title is stored separately.
- Return ONLY the formatted policy text. No preamble, no explanation, no code fences.`;

export async function POST(req) {
  try { await requireUser(); } catch (res) { return res; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "Formatting needs ANTHROPIC_API_KEY." }, { status: 503 });

  const { text, title } = await req.json().catch(() => ({}));
  if (!text || !String(text).trim()) return Response.json({ error: "Nothing to format." }, { status: 400 });

  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const r = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 3000,
      system: RULES,
      messages: [{
        role: "user",
        content: `Policy title: ${title || "(untitled)"}\n\nDraft to reformat:\n\n${String(text).slice(0, 20000)}`,
      }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return Response.json({ error: "Formatting failed.", detail: detail.slice(0, 300) }, { status: 502 });
  }
  const data = await r.json();
  const out = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  if (!out) return Response.json({ error: "Formatting came back empty." }, { status: 502 });
  return Response.json({ text: out });
}
