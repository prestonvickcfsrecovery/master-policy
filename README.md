# CFS Recovery Master Program Policy

The Master Program Policy as a web app: a searchable policy book, a chatbot that answers
from it, and a proposal-and-approval workflow that publishes agreed changes back into the
book.

Same structure and same setup as the Coaching Curriculum app. Two of the steps are shorter,
because you can reuse what you already built.

---

## What's in it

**71 entries**, one per policy code, exactly as the document numbers them:

| Section | Entries | What it covers |
|---|---|---|
| Start here | 2 | How to use the document, Document Control |
| Quick reference | 6 | The at-a-glance card for each program |
| Universal policies | 9 | U1–U9: refunds, late payment, access on exit, coach changes, ascension, ownership, prorated refunds, unsigned agreements, coach transitions |
| Recovery School | 7 | S1–S7 |
| Recovery Academy | 7 | A1–A7 |
| Platinum | 17 | P1–P17 |
| Caregiver Add-On | 7 | CG1–CG7 |
| Continuity | 7 | C1–C7 |
| Beyond Recovery | 9 | B1–B9 |

Every entry keeps its policy code, so "check P4" still means what it always meant. Search
finds policies by code or by words inside them, and each program has its own colour down
the left edge of the index.

Entries are marked **in force**, not draft — this is live policy, unlike the curriculum.

---

## What you'll need

Same four accounts as the curriculum app. If that one is running, **reuse the Google setup
and the Anthropic key**:

| Thing | Reuse from the curriculum app? |
|---|---|
| **Vercel** | Same account, new project |
| **Neon Postgres** | Same account, **new database** (see step 2) |
| **Google Cloud** | **Yes — same OAuth client**, just add one redirect URI |
| **Anthropic API key** | Yes, the same key works |

Budget about 20 minutes.

---

## Step 1 — Put the code on GitHub

Unzip the folder, create a new empty repo (for example `program-policy`), then upload
**the contents** of the `policy-app` folder — `app`, `components`, `data`, `lib`,
`scripts`, `package.json` and the rest. Not the folder itself.

## Step 2 — Vercel project and its own database

1. Vercel → **Add New → Project** → import the repo → deploy.
2. **Storage → Create Database → Neon.** Create a **new** database; don't reuse the
   curriculum one. Both apps use tables called `entries` and `proposals`, so sharing one
   database would have them overwrite each other.
3. Leave branching unchecked and the custom prefix blank, so the variable lands as
   `DATABASE_URL`.
4. Note your URL, for example `https://program-policy.vercel.app`.

## Step 3 — Google sign-in (reuse the existing client)

No new OAuth client needed:

1. Google Cloud Console → **Clients** → open the client you made for the curriculum app.
2. Under **Authorized redirect URIs**, click **Add URI** and add:
   `https://YOUR-POLICY-DOMAIN/api/auth/callback`
3. Save. The same Client ID and secret now serve both apps.

## Step 4 — Environment variables

In the new Vercel project, **Settings → Environment Variables**:

| Name | Value | Type |
|---|---|---|
| `AUTH_SECRET` | A **new** random string (`openssl rand -base64 32`) | Secret |
| `GOOGLE_CLIENT_ID` | Same as the curriculum app | Config |
| `GOOGLE_CLIENT_SECRET` | Same as the curriculum app | Secret |
| `APP_URL` | Your policy URL, no trailing slash | Config |
| `ALLOWED_DOMAINS` | `cfsrecovery.co` | Config |
| `BOARD_EMAILS` | Who can approve policy changes — see below | Config |
| `SETUP_TOKEN` | Any random string; delete it after step 5 | Secret |
| `ANTHROPIC_API_KEY` | Same key as the curriculum app | Secret |

Use a **different** `AUTH_SECRET` from the curriculum app, so signing everyone out of one
doesn't sign them out of the other.

**On `BOARD_EMAILS`:** the document names the **Client Success Director** as owner, with
exceptions requiring CSD written approval. That's a different group from the coaching
Review Board — probably CSD, COO, and you. Whoever is listed here sees the approve and
decline buttons.

Redeploy after saving.

## Step 5 — Load the policy

Visit once:

```
https://YOUR-POLICY-DOMAIN/api/setup?token=YOUR_SETUP_TOKEN
```

Expect `{"ok":true,"inserted":71,...}`. Re-running is safe: it skips entries that already
exist, so approved edits are never overwritten.

Then **delete `SETUP_TOKEN`**.

## Step 6 — Share it

Send the URL. Anyone at your domain can read, search, ask, and propose. Only the emails in
`BOARD_EMAILS` can approve.

---

## Proposing a brand-new policy

A proposal can either **change an existing policy** or **add a new one**. Adding a new one
asks for the section, a policy code (the next free one is suggested — U10, P18), a title,
and a one-line summary. On approval it becomes its own entry in the Policy tab, in the right
section, searchable, with its own history. It does not get folded into another policy.

The wording box has two helpers: **Preview** shows exactly how it will render in the Policy
tab, and **Tidy up formatting** rewrites a pasted draft into the house format (headings,
bullets, pipe tables) without changing any wording or figures.

Owners can also **restore** an earlier version from an entry's History, so a change that
went to the wrong place can be undone.

## How the three pages work here

**Policy** — the book, grouped by program. Tables render as tables, so the payment
escalation ladder, the cohort schedule, and the bundle pricing read the way they do in Word.
Each entry shows its version and its history.

**Ask** — describe a situation, get the rule plus the policy codes it came from. The
assistant is instructed to quote figures and deadlines exactly, never to estimate a price,
to name who decides and who acts, and to say plainly when the policy doesn't cover
something rather than invent an answer. Refund questions carry U1's "exception, not the
default" framing, and legal threats route to CSD or Leadership.

**Changes** — propose new wording, discuss it, and the owner approves or declines with a
reason. Approving publishes it and files the previous wording in history. That gives the
quarterly review cycle the document asks for, with a written record attached.

---

## Two things worth knowing

**Pricing now lives in three places:** this app, the Word document, and the reply tool's
`data/price-ledger.json`. The reply tool treats its ledger as authoritative and already has
`scripts/check-price-drift.mjs` for exactly this problem. Once this is live, point that
script at `/api/entries` so drift gets caught automatically. Otherwise three sources of
truth hold the same numbers, which is how the August Platinum pricing incident happened.

**Decide which copy wins.** Today the Word document is the source and this app is a copy of
v3.6. The moment someone approves a change here, the two diverge. Pick one: either this app
becomes the master and the document is exported from it, or the document stays master and
changes approved here get written back. The first is cleaner.

---

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in
npm run setup                # loads data/policy.json into your database
npm run dev
```

## If something goes wrong

| Symptom | Cause |
|---|---|
| 404 on every page | The repo has a zip or a nested folder; `package.json` must be at the top level |
| Build fails on "No Output Directory named public" | Framework Preset is set to Other; change it to Next.js |
| Redirect loop at sign-in | `APP_URL` doesn't match the domain, or the redirect URI wasn't added in step 3 |
| "The policy hasn't been loaded yet" | Step 5 hasn't run, or `DATABASE_URL` is missing |
| Ask returns a 502 | Invalid API key, no credit, or a model your key can't reach — set `ANTHROPIC_MODEL` |
| No approve buttons | Your email isn't in `BOARD_EMAILS`, exact and lowercase |
