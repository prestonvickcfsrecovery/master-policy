import { q } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STOP = new Set(["the","and","for","with","that","this","what","how","should","does","are","you",
  "they","their","when","about","from","have","has","can","client","clients","coach","coaching","not","但"]);

/** Pick the handful of entries most likely to answer the question.
 *  The whole curriculum is far larger than one prompt, so this is the
 *  retrieval step: score by term hits, weight title and summary heavily. */
function retrieve(question, entries, maxChars = 34000) {
  const terms = (question.toLowerCase().match(/[a-z0-9'-]{3,}/g) || []).filter((t) => !STOP.has(t));
  const scored = entries
    .map((e) => {
      const title = e.title.toLowerCase();
      const summary = (e.summary || "").toLowerCase();
      const body = (e.body || "").toLowerCase();
      let n = 0;
      for (const w of terms) {
        if (title.includes(w)) n += 6;
        if (summary.includes(w)) n += 3;
        n += Math.min(body.split(w).length - 1, 6);
      }
      if (question.toLowerCase().includes(e.code.toLowerCase())) n += 12;
      return { e, n };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  const picked = [];
  let chars = 0;
  for (const { e } of scored) {
    if (picked.length >= 5) break;
    if (chars + e.body.length > maxChars) continue;
    chars += e.body.length;
    picked.push(e);
  }
  if (!picked.length) return entries.filter((e) => e.section === "core").slice(0, 3);
  return picked;
}

const RULES = `You are a reference assistant for the CFS Recovery team: coaches, client success, VA team, and operations. You answer staff, not clients.

Answer ONLY from the policy extracts below. Rules:
- Always cite the policy code (like U1, P4, CG3) for every rule you state. Staff need to be able to look it up.
- Quote figures, deadlines, and prices exactly as the policy states them. Never estimate, round, or infer a price or a timeframe.
- If the extracts do not cover the question, say so plainly and say who to ask. Never invent a policy. Inventing a rule is worse than saying you don't know.
- Name who decides and who acts. Most refund and exception decisions require CSD approval; some are Leadership only.
- Refunds are the exception, not the default (U1). Do not suggest a refund is likely where the policy says case-by-case.
- Legal threats are never handled at coach level: escalate to CSD or Leadership (U1).
- Where a policy points to another policy, mention that link too.
- Be brief and practical: the rule first, then the steps and who owns each one. No preamble.`;

export async function POST(req) {
  try { await requireUser(); } catch (res) { return res; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "The assistant is not configured. Add ANTHROPIC_API_KEY in Vercel." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const turns = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const question = [...turns].reverse().find((m) => m.role === "user")?.content || "";
  if (!question.trim()) return Response.json({ error: "Ask a question first." }, { status: 400 });

  let entries = [];
  try {
    entries = await q(`SELECT id, code, title, summary, body, section, status FROM entries`);
  } catch (e) {
    return Response.json({ error: "Couldn't reach the curriculum database." }, { status: 500 });
  }

  const picked = retrieve(question, entries);
  const context = picked
    .map((e) => `=== ${e.code} ${e.title} (status: ${e.status}) ===\n${e.body}`)
    .join("\n\n");

  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const upstream = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1200,
      stream: true,
      system: `${RULES}\n\nCURRICULUM EXTRACTS:\n\n${context}`,
      messages: turns.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 8000),
      })),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: "The assistant call failed.", status: upstream.status, detail: detail.slice(0, 400) },
      { status: 502 }
    );
  }

  // Re-emit as plain text chunks, with the cited entries announced first.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const cites = picked.map((e) => ({ id: e.id, code: e.code, title: e.title }));

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ type: "cites", cites }) + "\n"));
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", text: ev.delta.text }) + "\n"));
              } else if (ev.type === "error") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: ev.error?.message || "Stream error" }) + "\n"));
              }
            } catch { /* ignore keep-alive and partial frames */ }
          }
        }
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: "The answer was cut off." }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
