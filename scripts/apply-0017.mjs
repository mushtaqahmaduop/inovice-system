// One-shot applier for migration 0017 (per-line delivery_fee).
//
// `drizzle-kit migrate` silently skips hand-authored migrations whose journal
// entry is newer than the tracking table's newest created_at (the 0013
// lesson): exit 0, nothing applied, no error. So we apply the SQL directly in
// a single transaction and hand-insert the tracking row ourselves, keyed to
// the journal's `when` so a later `drizzle-kit migrate` considers it done.
//
//   node --env-file=.env.local scripts/apply-0017.mjs          # apply
//   node --env-file=.env.local scripts/apply-0017.mjs --check  # report only
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const TAG = "0017_line_delivery_fee";
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
       WHERE table_schema = 'public' AND table_name = 'invoice_lines'
         AND column_name = 'delivery_fee'
    ) AS exists`;

  if (CHECK || exists) {
    console.log(`invoice_lines.delivery_fee column present: ${exists}`);
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

  // Report what the backfill moved — drafts only; issued/voided are frozen.
  const [{ moved }] = await sql`
    SELECT COUNT(*)::int AS moved
      FROM public.invoice_lines
     WHERE delivery_fee > 0`;
  console.log(`applied ${TAG} — ${moved} line(s) now carry a delivery charge`);
} finally {
  await sql.end();
}
