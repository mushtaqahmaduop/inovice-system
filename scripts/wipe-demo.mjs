// Go-live demo-data wipe. Clears the TRANSACTIONAL data (invoices, their
// lines/fees/events/extra-columns, payments, customers) and resets the invoice
// number counter, so the first real invoice is INV-1 again. KEEPS everything
// the business set up: settings (company details), services, payment methods,
// user accounts and their MFA.
//
// Why a script and not a screen button: issued invoices are immutable by law
// (CLAUDE.md §3.1) — the app and RLS have NO delete path for them, and DB
// triggers block UPDATE/DELETE. TRUNCATE is the one sanctioned way to clear
// them, and only a developer/operator runs it, once, at go-live.
//
// Usage (from C:\Inovice-system):
//   node --env-file=.env.local scripts/wipe-demo.mjs            # DRY RUN — shows counts, changes nothing
//   node --env-file=.env.local scripts/wipe-demo.mjs --confirm  # actually wipes (writes a JSON backup first)
//   pnpm db:wipe-demo            (dry run)
//   pnpm db:wipe-demo -- --confirm
//
// It ALWAYS writes a timestamped JSON backup of the cleared tables next to the
// repo before truncating, so a mistake is recoverable.

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_MIGRATIONS is not set — run with --env-file=.env.local");
  process.exit(1);
}
const confirm = process.argv.includes("--confirm");

// Order matters only for the backup read; TRUNCATE ... CASCADE handles FKs.
const CLEAR = [
  "payments",
  "invoice_line_fees",
  "invoice_lines",
  "invoice_extra_columns",
  "invoice_events",
  "invoices",
  "customers",
  "invoice_counters",
];
const KEEP = ["settings", "services", "payment_methods", "profiles", "mfa_recovery_codes"];

const sql = postgres(dbUrl, { prepare: false, max: 1 });

async function counts(tables) {
  const out = {};
  for (const t of tables) {
    const r = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
    out[t] = r[0].n;
  }
  return out;
}

try {
  console.log("\n  Prestige Land — demo-data wipe\n  " + "-".repeat(40));
  const before = await counts(CLEAR);
  const keep = await counts(KEEP);

  console.log("  WILL CLEAR (transactional data):");
  for (const t of CLEAR) console.log(`    ${t.padEnd(22)} ${before[t]} row(s)`);
  console.log("\n  WILL KEEP (your setup):");
  for (const t of KEEP) console.log(`    ${t.padEnd(22)} ${keep[t]} row(s)`);

  if (!confirm) {
    console.log(
      "\n  DRY RUN — nothing was changed.\n  Re-run with  --confirm  to wipe (a JSON backup is written first).\n"
    );
    await sql.end();
    process.exit(0);
  }

  // 1) Backup every table we're about to clear.
  const backup = {};
  for (const t of CLEAR) backup[t] = await sql`SELECT * FROM ${sql(t)}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-wipe-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\n  Backup written: ${file}`);

  // 2) TRUNCATE — bypasses the immutability triggers cleanly; RESTART IDENTITY
  //    resets the invoice counter so the first real invoice is INV-1.
  await sql.unsafe(
    `TRUNCATE ${CLEAR.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`
  );

  const after = await counts(CLEAR);
  const allZero = Object.values(after).every((n) => n === 0);
  console.log("\n  AFTER:");
  for (const t of CLEAR) console.log(`    ${t.padEnd(22)} ${after[t]} row(s)`);
  console.log(
    `\n  ${allZero ? "DONE ✅ transactional data cleared — next invoice will be INV-1." : "WARNING: some tables are not empty."}\n`
  );
  await sql.end();
} catch (e) {
  console.error("\n  ERROR:", e.message, "\n");
  await sql.end().catch(() => {});
  process.exit(1);
}
