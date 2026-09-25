# Connecting the Master Policy app to the Reply Tool

The Master Policy app becomes the source of truth. The reply tool pulls from it at
build time, re-embeds it, and grounds every Skool DM / Admin draft on it.

**Before you start, know this:** the reply tool already contains a copy of the
Master Program Policy — 77 sections, `data/admin-policy.json`, snapshotted
September 7 and untouched since. Your policy app has 71. They've drifted. Step 4
below shows you exactly how, before anything changes.

---

## Setup — about 15 minutes, once

### 1. Add the publish endpoint to the policy app

Copy `app/api/corpus/route.js` into your **master-policy** repo at exactly that
path. It's self-contained — it opens its own database connection and imports
nothing from the rest of the app, so no existing file changes.

### 2. Make a shared token

Any long random string. Generate one:

```
openssl rand -hex 32
```

Add it to **both** Vercel projects:

| Project | Variable | Value |
|---|---|---|
| master-policy | `CORPUS_TOKEN` | the string |
| reply tool | `POLICY_CORPUS_TOKEN` | the same string |

### 3. Point the reply tool at the policy app

On the **reply tool** project, add:

```
POLICY_CORPUS_URL = https://<your-master-policy-domain>/api/corpus
```

Use whatever the policy app's production domain actually is.

### 4. Look at the drift before you sync ← do not skip

Redeploy both projects, then open this in your browser:

```
https://<reply-tool-domain>/api/policy-sync?token=<APP_PASSWORD>&dry=1
```

It changes nothing. It tells you three things:

- `only_in_policy_app` — sections the bot is about to gain
- `only_in_reply_tool` — **sections the bot will LOSE if you sync now**
- `text_differs` — sections whose wording changed

If `only_in_reply_tool` isn't empty, add those sections to the policy app first.
Otherwise the bot forgets them. The `note` field says this in plain English.

### 5. Add the deploy hook

Reply tool → Settings → Git → Deploy Hooks → create one (branch `main`), copy the
URL, and add it to the reply tool as:

```
VERCEL_DEPLOY_HOOK_URL = https://api.vercel.com/v1/integrations/deploy/...
```

Done. The next build pulls the live policy.

---

## How it stays in sync

**Bookmark this.** After approving a policy change, open:

```
https://<reply-tool-domain>/api/policy-sync?token=<APP_PASSWORD>
```

It compares the live policy to what's baked into the current build and rebuilds
only if something changed. Live in about three minutes. If nothing changed it
answers `"action": "none"` and does nothing.

**A daily cron** (`vercel.json`, 12:00 UTC) runs the same check, so anything you
forget to sync catches up overnight.

**Want it instant and automatic?** Your policy app's approve handler needs to POST
to the deploy hook. That's about five lines, but I need the master-policy repo to
put them in the right place — send it over and I'll wire it.

> Your Vercel plan currently allows one cron run per day (your `/api/sync` cron is
> daily too). That's why the automatic check is daily rather than every 15 minutes.

---

## What happens when something goes wrong

The build **never** ships a worse policy than the one already committed. If the
policy app is down, slow, returns an error, sends back a suspiciously small
corpus, or has lost a section the bot routes on, the build logs a warning and
keeps the committed file. Verified against all five failure modes.

One case deserves attention. Retrieval has hardcoded routing — billing language
force-pulls `O5`, assessment questions pull `O6`, Beyond Recovery pulls `B3` and
`B2`, refund/legal pulls `U1`. If any of `U1, P4, O1–O8, O10, B2, B3` disappears
from the policy app, the sync **refuses** and says which one:

```
[policy-sync] ⚠ these sections drive deterministic routing and are missing
from the policy app: O5. Restore or re-code them there, then redeploy
```

So renaming a policy section in the app can't silently break the bot. If you do
need to renumber, tell me and I'll update the routing rules to match.

---

## Fixed along the way: the bot was scrubbing correct prices

The guard that stops the bot inventing prices built its allowed list from the
quick-reference card only. But the card is a summary, and **eight amounts that
appear in your actual policy weren't on it**:

`$162.87` · `$5,250` · `$7,497` · `$7,000` · `$3,500` · `$1,750` · `$10,000` · `$5,000`

Any draft quoting one of those was being rewritten as a violation — the bot was
removing correct information. The allowed list now reads the policy itself, so
every price written in policy is quotable, and when you change a price in the
policy app the new one is allowed automatically. Invented prices are still
rejected.

If the policy app publishes Quick Reference cards (any entry whose section, title
or code marks it as one), the endpoint sends them and the card is refreshed too.
If not, the committed card is kept and the build log lists which prices it's
missing.

---

## Files

**master-policy app**

| File | What |
|---|---|
| `app/api/corpus/route.js` | **new** — token-gated publish endpoint, self-contained |

**reply tool**

| File | What |
|---|---|
| `scripts/fetch-policy.mjs` | **new** — build-time pull, fail-soft, integrity check, diff report |
| `app/api/policy-sync/route.js` | **new** — dry-run diff, version compare, deploy-hook trigger |
| `data/policy-version.json` | **new** — which policy version this build contains |
| `lib/admin-core.js` | allowed-price list now includes every price in the policy |
| `package.json` | `prebuild` runs the policy fetch first |
| `vercel.json` | daily policy-sync cron |

## Environment variables

| Project | Variable | Purpose |
|---|---|---|
| master-policy | `CORPUS_TOKEN` | gates the publish endpoint |
| reply tool | `POLICY_CORPUS_URL` | where to pull from |
| reply tool | `POLICY_CORPUS_TOKEN` | same value as `CORPUS_TOKEN` |
| reply tool | `VERCEL_DEPLOY_HOOK_URL` | what a change triggers |

Nothing else changes. Curriculum stays unconnected, and the community, Facebook
and Instagram modes are untouched.
