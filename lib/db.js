import pg from "pg";

// Vercel's Postgres integrations set one of these. Any Postgres URL works.
const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

let pool;

/** One pool per serverless instance; reused across warm invocations. */
export function db() {
  if (!url) throw new Error("No database URL set. Add DATABASE_URL in Vercel.");
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function q(text, params = []) {
  const res = await db().query(text, params);
  return res.rows;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  section      TEXT NOT NULL,
  ord          INTEGER NOT NULL DEFAULT 0,
  zone         TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  review_refs  JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_note  TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS entry_versions (
  id          SERIAL PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  TEXT NOT NULL DEFAULT '',
  proposal_id INTEGER,
  note        TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS entry_versions_unique ON entry_versions(entry_id, version);

CREATE TABLE IF NOT EXISTS proposals (
  id              SERIAL PRIMARY KEY,
  entry_id        TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'Change to existing guidance',
  proposed_text   TEXT NOT NULL DEFAULT '',
  rationale       TEXT NOT NULL DEFAULT '',
  urgency         TEXT NOT NULL DEFAULT 'Routine',
  status          TEXT NOT NULL DEFAULT 'open',
  author_email    TEXT NOT NULL,
  author_name     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by      TEXT NOT NULL DEFAULT '',
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT NOT NULL DEFAULT '',
  applied_version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proposals_status ON proposals(status, created_at DESC);

-- Added after launch: a proposal can create a brand-new policy, not only
-- replace an existing one. Safe to re-run; existing rows default to 'edit'.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS kind        TEXT NOT NULL DEFAULT 'edit';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS new_code    TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS new_title   TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS new_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS new_section TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS created_entry_id TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ALTER COLUMN entry_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS comments (
  id           SERIAL PRIMARY KEY,
  proposal_id  INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name  TEXT NOT NULL DEFAULT '',
  text         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_proposal ON comments(proposal_id, created_at);
`;

export async function migrate() {
  await db().query(SCHEMA);
}
