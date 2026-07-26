// Generic applier for hand-authored migrations (the 0015 one-shot, generalised).
//
// `drizzle-kit migrate` silently skips hand-authored migrations whose journal
// entry is newer than the tracking table's newest created_at (the 0013
// lesson): exit 0, nothing applied, no error. So we apply the SQL directly in
// a single transaction and hand-insert the tracking row ourselves, keyed to
// the journal's `when` so a later `drizzle-kit migrate` considers it done.
//
// Whether the migration has run is decided by the tracking row for THIS file's
// hash — edit the .sql after applying it and the hash changes, which is a
// deliberate re-apply signal, not a silent no-op.
//
//   node scripts/apply-migration.mjs 0016_delete_draft           # apply
//   node scripts/apply-migration.mjs 0016_delete_draft --check   # report only
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const TAG = args.find((a) => !a.startsWith("--"));
if (!TAG) throw new Error("usage: node scripts/apply-migration.mjs <tag> [--check]");

const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MIGRATIONS (or DATABASE_URL) required");

const file = readFileSync(`db/migrations/${TAG}.sql`, "utf8");
const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8"));
const entry = journal.entries.find((e) => e.tag === TAG);
if (!entry) throw new Error(`no journal entry for ${TAG}`);

const hash = createHash("sha256").update(file).digest("hex");
const statements = file
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const sql = postgres(url, { max: 1, prepare: false });

try {
  const tracked = await sql`
    SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
  console.log(
    `${TAG}: ${statements.length} statements, tracking row present: ${tracked.length > 0}`
  );

  if (CHECK || tracked.length > 0) {
    if (tracked.length > 0 && !CHECK) console.log("already applied — nothing to do");
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    for (const [i, statement] of statements.entries()) {
      await tx.unsafe(statement);
      console.log(`  ✓ statement ${i + 1}/${statements.length}`);
    }
    await tx`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})`;
  });

  console.log(`applied ${TAG}`);
} finally {
  await sql.end();
}
