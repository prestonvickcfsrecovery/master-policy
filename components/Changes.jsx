"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { plain, when } from "@/lib/md";

const TYPES = ["Change to existing guidance", "New content", "Clarification", "Removal", "Editorial"];

export default function Changes({ user }) {
  const router = useRouter();
  const params = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [proposals, setProposals] = useState(null);
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState({
    entryId: "", title: "", type: TYPES[0], proposedText: "", rationale: "", urgency: "Routine",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [drafts, setDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [working, setWorking] = useState({});

  async function loadAll() {
    const [e, p] = await Promise.all([
      fetch("/api/entries").then((r) => r.json()),
      fetch("/api/proposals").then((r) => r.json()),
    ]);
    setEntries(e.entries || []);
    setProposals(p.proposals || []);
    setComments(p.comments || []);
    return e.entries || [];
  }

  useEffect(() => {
    loadAll().then((list) => {
      const want = params.get("entry");
      setForm((f) => ({ ...f, entryId: (want && list.some((x) => x.id === want)) ? want : (list[0]?.id || "") }));
    });
  }, [params]);

  const open = useMemo(() => (proposals || []).filter((p) => p.status === "open"), [proposals]);
  const decided = useMemo(() => (proposals || []).filter((p) => p.status !== "open"), [proposals]);

  async function submit() {
    if (!form.title.trim() || !form.entryId) { setMsg("Give it a title and pick an entry."); return; }
    setSaving(true); setMsg("");
    const r = await fetch("/api/proposals", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
    }).then((x) => x.json()).catch(() => ({ error: "Couldn't submit." }));
    setSaving(false);
    if (r.error) { setMsg(r.error); return; }
    setForm((f) => ({ ...f, title: "", proposedText: "", rationale: "" }));
    setMsg("Submitted. The policy owner will see it.");
    loadAll();
  }

  async function comment(id) {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    setDrafts((d) => ({ ...d, [id]: "" }));
    await fetch(`/api/proposals/${id}/comments`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }),
    });
    loadAll();
  }

  async function decide(id, approve) {
    setWorking((w) => ({ ...w, [id]: approve ? "Publishing…" : "Declining…" }));
    const r = await fetch(`/api/proposals/${id}/decide`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve, note: notes[id] || "" }),
    }).then((x) => x.json()).catch(() => ({ error: "Couldn't record that." }));
    setWorking((w) => ({ ...w, [id]: r.error || "" }));
    if (!r.error) loadAll();
  }

  function Card({ p }) {
    const entry = entries.find((e) => e.id === p.entry_id);
    const cs = comments.filter((c) => c.proposal_id === p.id);
    return (
      <div className={`card ${p.status}`}>
        <div className="meta" style={{ marginBottom: 6 }}>
          <span className={`chip ${p.status}`}>{p.status}</span>
          <span>{p.entry_code}</span><span>·</span>
          <span>{p.author_name || p.author_email}</span><span>·</span>
          <span>{when(p.created_at)}</span>
          {String(p.urgency || "").startsWith("Safety") && <span className="rr hi">fast track</span>}
        </div>
        <h3>{p.title}</h3>
        <div className="meta">{p.type} · {p.entry_title}</div>
        {p.rationale && <p style={{ margin: "10px 0 0", fontSize: "14.5px" }}>{p.rationale}</p>}

        {p.proposed_text && entry && (
          <div className="diff">
            <div className="was">
              <h4>CURRENT — v{entry.version}</h4>
              {plain(entry.body).slice(0, 700)}{entry.body.length > 700 ? "…" : ""}
            </div>
            <div className="now">
              <h4>PROPOSED</h4>
              {plain(p.proposed_text).slice(0, 700)}{p.proposed_text.length > 700 ? "…" : ""}
            </div>
          </div>
        )}

        {p.status !== "open" && (
          <div className="note" style={{ marginTop: 10 }}>
            <b>{p.status === "approved" ? "Approved" : "Declined"}</b> by {p.decided_by} on {when(p.decided_at)}
            {p.decision_note ? ` — ${p.decision_note}` : ""}
            {p.status === "approved" && p.applied_version ? ` · published as v${p.applied_version}` : ""}
          </div>
        )}

        {cs.map((c) => (
          <div className="cmt" key={c.id}>
            <div className="who2">{c.author_name || c.author_email} · {when(c.created_at)}</div>
            {c.text}
          </div>
        ))}

        {p.status === "open" && (
          <>
            <div className="cmt" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <input
                placeholder="Add to the discussion"
                value={drafts[p.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); comment(p.id); } }}
                style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 7, background: "var(--paper)" }}
              />
              <button className="btn sm ghost" onClick={() => comment(p.id)}>Comment</button>
            </div>

            {user?.isBoard ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  placeholder="Reason for the decision"
                  value={notes[p.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                  style={{ flex: 1, minWidth: 180, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 7, background: "var(--paper)" }}
                />
                <button className="btn sm ok" disabled={!!working[p.id]} onClick={() => decide(p.id, true)}>
                  {working[p.id] === "Publishing…" ? "Publishing…" : "Approve and publish"}
                </button>
                <button className="btn sm no" disabled={!!working[p.id]} onClick={() => decide(p.id, false)}>Decline</button>
                {working[p.id] && working[p.id] !== "Publishing…" && working[p.id] !== "Declining…" && (
                  <span className="note">{working[p.id]}</span>
                )}
              </div>
            ) : (
              <p className="note" style={{ marginTop: 10 }}>The policy owner decides this one.</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-solo">
      <div className="two">
        <div>
          <h2 className="sec-h">Changes</h2>
          <p className="sec-p">
            Proposals waiting on a decision, and every decision already made. Approving a proposal publishes
            its wording straight into the policy and keeps the previous wording in the entry&apos;s history.
          </p>
          {proposals === null ? (
            <div className="empty"><span className="spin" /> Loading…</div>
          ) : !proposals.length ? (
            <div className="empty"><b>No proposals yet.</b><br />The first one starts on the right, or from any curriculum entry.</div>
          ) : (
            <>
              {open.length ? <><div className="grp">Waiting on a decision</div>{open.map((p) => <Card key={p.id} p={p} />)}</>
                : <div className="empty">Nothing is waiting on a decision.</div>}
              {decided.length ? <><div className="grp" style={{ marginTop: 26 }}>Decided</div>{decided.map((p) => <Card key={p.id} p={p} />)}</> : null}
            </>
          )}
        </div>

        <div>
          <div className="card">
            <h3>Propose a change</h3>
            <p className="note" style={{ margin: "4px 0 14px" }}>
              Anyone can propose. The policy owner decides, and the reason is recorded either way.
            </p>
            <div className="field">
              <label htmlFor="entry">Policy this changes</label>
              <select id="entry" value={form.entryId} onChange={(e) => setForm({ ...form, entryId: e.target.value })}>
                {entries.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ptitle">What are you changing? <span className="hint">One line</span></label>
              <input id="ptitle" value={form.title} placeholder="e.g. Extend the Platinum pause window to 10 weeks"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ptype">Type</label>
              <select id="ptype" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ptext">Proposed wording <span className="hint">Replaces the entry if approved. Leave blank to discuss first.</span></label>
              <textarea id="ptext" value={form.proposedText} placeholder="Write the entry as you think it should read…"
                onChange={(e) => setForm({ ...form, proposedText: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pwhy">Why this change <span className="hint">What happened, how often, what it costs us</span></label>
              <textarea id="pwhy" style={{ minHeight: 64 }} value={form.rationale}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="purg">Urgency</label>
              <select id="purg" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                <option>Routine</option>
                <option>Safety — fast track</option>
              </select>
            </div>
            <button className="btn" onClick={submit} disabled={saving}>
              {saving ? "Submitting…" : "Submit proposal"}
            </button>
            {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
