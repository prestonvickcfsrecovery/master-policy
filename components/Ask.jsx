"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { md } from "@/lib/md";
import { load, save, clear } from "@/lib/persist";

const STARTERS = [
  "A Platinum client wants to pause for 10 weeks. What are the rules?",
  "A client's payment failed two weeks ago and they've gone quiet. What now?",
  "An Academy member is ascending to Platinum mid-cycle. Do they get a refund?",
  "A client is threatening legal action over a refund. What do I do?",
];

export default function Ask({ initialName }) {
  const router = useRouter();
  const params = useSearchParams();
  const [chat, setChat] = useState([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const ctlRef = useRef(null);
  const endRef = useRef(null);

  // Bring back the conversation and any half-typed question from last time.
  useEffect(() => {
    const saved = load("chat", []);
    if (saved.length) setChat(saved.map((m) => ({ ...m, pending: false })));
    const box = load("askDraft", "");
    if (box) setDraft(box);
    setReady(true);
  }, []);

  useEffect(() => {
    const q = params.get("q");
    if (q) { setDraft(q); boxRef.current?.focus(); }
  }, [params]);

  // Keep the stored copy in step, but never store a half-streamed answer.
  useEffect(() => {
    if (!ready || busy) return;
    save("chat", chat.slice(-20).map(({ role, content, cites }) => ({ role, content, cites })));
  }, [chat, ready, busy]);

  useEffect(() => { if (ready) save("askDraft", draft); }, [draft, ready]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [chat]);

  async function send(text) {
    const question = (text ?? draft).trim();
    if (!question || busy) return;
    setDraft("");
    const history = [...chat, { role: "user", content: question }];
    setChat([...history, { role: "assistant", content: "", cites: [], pending: true }]);
    setBusy(true);

    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctl.signal,
      });

      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        setChat((c) => {
          const n = [...c];
          n[n.length - 1] = { role: "assistant", content: e.error || "The assistant didn't answer. Try again.", cites: [] };
          return n;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", answer = "", cites = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "cites") cites = ev.cites || [];
          else if (ev.type === "text") answer += ev.text;
          else if (ev.type === "error") answer += `\n\n*${ev.message}*`;
          setChat((c) => {
            const n = [...c];
            n[n.length - 1] = { role: "assistant", content: answer, cites, pending: !answer };
            return n;
          });
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setChat((c) => {
          const n = [...c];
          n[n.length - 1] = { role: "assistant", content: "That question didn't get through. Try asking it again.", cites: [] };
          return n;
        });
      }
    } finally {
      setBusy(false);
      ctlRef.current = null;
    }
  }

  // Carry an answer over to the Changes tab as the starting wording.
  function startProposal(text) {
    const draftProposal = load("proposal", {});
    save("proposal", { ...draftProposal, proposedText: text });
    router.push("/changes");
  }

  function newConversation() {
    setChat([]); setDraft("");
    clear("chat"); clear("askDraft");
  }

  return (
    <div className="page-solo">
      <div className="ask">
        {!chat.length && (
          <>
            <h2 className="sec-h">Ask the policy</h2>
            <p className="sec-p">
              Describe the situation and get the rule that applies, with the policy codes it came from.
              Answers come only from the Master Program Policy, so if something isn&apos;t covered it will
              say so rather than guess.
            </p>
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} className="starter" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </>
        )}

        {chat.length > 0 && (
          <div className="thread-top">
            <span className="note">Your conversation is kept while you move between tabs.</span>
            <button className="linkish" onClick={newConversation}>Start over</button>
          </div>
        )}

        <div className="thread">
          {chat.map((m, i) => (
            <div className={`turn ${m.role === "user" ? "me" : ""}`} key={i}>
              <div className="av">{m.role === "user" ? (initialName || "Y").slice(0, 1).toUpperCase() : "C"}</div>
              <div className="bub">
                {m.role === "user" ? (
                  <div className="txt">{m.content}</div>
                ) : m.pending ? (
                  <div className="txt note"><span className="spin" /> Thinking…</div>
                ) : (
                  <div className="txt" dangerouslySetInnerHTML={{ __html: md(m.content) }} />
                )}
                {m.role === "assistant" && !m.pending && m.content && (
                  <div className="answer-actions">
                    <button className="linkish" onClick={() => startProposal(m.content)}>
                      Start a proposal from this
                    </button>
                  </div>
                )}
                {!!m.cites?.length && !m.pending && (
                  <div className="cites">
                    {m.cites.map((c) => (
                      <button key={c.id} className="cite" onClick={() => router.push(`/#${c.id}`)}>
                        {c.code} {c.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="composer">
          <div className="box">
            <textarea
              ref={boxRef}
              rows={1}
              placeholder="Describe the situation…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 170) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            {busy ? (
              <button className="btn ghost" onClick={() => ctlRef.current?.abort()}>Stop</button>
            ) : (
              <button className="btn" onClick={() => send()}>Ask</button>
            )}
          </div>
          <p className="note" style={{ margin: "7px 2px 0" }}>
            Answers are drafted from policy entries and can be wrong. Check the cited policy before acting on
            anything involving money, access, or an exception.
          </p>
        </div>
      </div>
    </div>
  );
}
