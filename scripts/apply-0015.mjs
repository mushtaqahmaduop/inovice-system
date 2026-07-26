// One-shot applier for migration 0015 (delivery_fee).
//
// `drizzle-kit migrate` silently skips hand-authored migrations whose journal
// entry is newer than the tracking table's newest created_at (the 0013
// lesson): exit 0, nothing applied, no error. So we apply the SQL directly in
// a single transaction and hand-insert the tracking row ourselves, keyed to
// the journal's `when` so a later `drizzle-kit migrate` considers it done.
//
//   node scripts/apply-0015.mjs          # apply
//   node scripts/apply-0015.mjs --check  # report state only, change nothing
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const TAG = "0015_delivery_fee";
const CHECK = process.argv.includes("--check");

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
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'invoices'
         AND column_name = 'delivery_fee'
    ) AS exists`;

  if (CHECK || exists) {
    console.log(`delivery_fee column present: ${exists}`);
    const tracked = await sql`
      SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
    console.log(`tracking row present: ${tracked.length > 0}`);
    if (exists && !CHECK) console.log("already applied — nothing to do");
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
