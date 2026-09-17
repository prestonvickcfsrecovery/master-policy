// Local alternative to /api/setup: `npm run setup` with DATABASE_URL set.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error("Set DATABASE_URL first."); process.exit(1); }

const schema = readFileSync(new URL("../lib/schema.sql", import.meta.url), "utf8");
const curriculum = JSON.parse(readFileSync(new URL("../data/policy.json", import.meta.url), "utf8"));
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
await client.query(schema);
let inserted = 0, skipped = 0;
for (const e of curriculum) {
  const { rows } = await client.query("SELECT 1 FROM entries WHERE id=$1", [e.id]);
  if (rows.length) { skipped++; continue; }
  await client.query(
    `INSERT INTO entries (id,code,title,summary,body,section,ord,zone,status,review_refs,source_note,version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)`,
    [e.id, e.code, e.title, e.summary, e.body, e.section, e.order, e.zone, e.status,
     JSON.stringify(e.reviewRefs || []), e.sourceNote || ""]
  );
  await client.query(
    `INSERT INTO entry_versions (entry_id,version,body,status,changed_by,note)
     VALUES ($1,1,$2,$3,'setup','Loaded from Master Program Policy v3.6')`,
    [e.id, e.body, e.status]
  );
  inserted++;
}
console.log(`Done. ${inserted} loaded, ${skipped} already there.`);
await client.end();
