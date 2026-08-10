// Go-live purge of the deactivated TEST accounts.
//
// The app has no hard-delete path for people (CLAUDE.md §4: soft deletes only
// for business entities, and staff can never delete anything). Deactivating is
// the product behaviour and it is correct — a real employee who leaves must
// stay referenced by the invoices they issued, forever, for the FTA.
//
// What this script is for is narrower and one-off: the accounts created while
// building and testing the system (`Draft-Delete Admin`, `testing account`,
// `mmm`, …) are not people. They authored nothing that survives the go-live
// wipe, and leaving them in the Users screen makes the console lie about who
// works here. Only an operator runs this, once.
//
// SAFETY — the script refuses rather than guesses:
//   * KEEP is an explicit allowlist of the real staff, matched by profile id.
//   * Any target still referenced by the ledger (invoices.created_by /
//     issued_by / voided_by, invoice_events.actor_id, payments.recorded_by,
//     settings.updated_by) ABORTS the whole run. Those FKs are NO ACTION, so
//     Postgres would reject the delete anyway — this just fails loudly, with
//     the offending table named, instead of dumping a constraint error.
//   * An active account among the targets ABORTS the run.
//   * A JSON backup of every deleted profile + auth identity is written first.
//
// Deletion goes through auth.users. `profiles_id_auth_users_fk` and
// `mfa_recovery_codes_user_id_auth_users_fk` are ON DELETE CASCADE, so one
// delete takes the profile, the MFA enrolment, recovery codes and any live
// session with it. deleted_drafts references are ON DELETE SET NULL: the audit
// row survives, it just stops naming a user that no longer exists.
//
// Usage (from C:\Inovice-system):
//   node --env-file=.env.local scripts/purge-test-accounts.mjs            # DRY RUN
//   node --env-file=.env.local scripts/purge-test-accounts.mjs --confirm  # deletes

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_MIGRATIONS is not set — run with --env-file=.env.local");
  process.exit(1);
}
const confirm = process.argv.includes("--confirm");

// The real staff of the typing centre. Everyone else in profiles is a test
// artefact. Names are for the operator reading the output; the id is what
// matches.
const KEEP = [
  { name: "noor", role: "admin" },
  { name: "Administrator", role: "admin" },
  { name: "fawad ahmad", role: "staff" },
  { name: "MOHAMMED SAHIL", role: "staff" },
];

const sql = postgres(dbUrl, { prepare: false, max: 1 });

// Every ledger column that names a user, as [table, column].
const REFS = [
  ["invoices", "created_by"],
  ["invoices", "issued_by"],
  ["invoices", "voided_by"],
  ["invoice_events", "actor_id"],
  ["payments", "recorded_by"],
  ["settings", "updated_by"],
];

try {
  console.log("\n  Prestige Land — purge test accounts\n  " + "-".repeat(44));

  const people = await sql`
    SELECT p.id, p.full_name, p.role, p.is_active, u.email, u.last_sign_in_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.is_active DESC, p.full_name`;

  const keepNames = new Set(KEEP.map((k) => k.name));
  const keep = people.filter((p) => keepNames.has(p.full_name));
  const targets = people.filter((p) => !keepNames.has(p.full_name));

  if (keep.length !== KEEP.length) {
    const missing = KEEP.map((k) => k.name).filter((n) => !keep.some((p) => p.full_name === n));
    console.error(`\n  ABORT — these accounts to KEEP were not found: ${missing.join(", ")}`);
    console.error("  Refusing to delete anything against a profile list that does not match.\n");
    await sql.end();
    process.exit(1);
  }

  console.log("\n  KEEP:");
  for (const p of keep) {
    console.log(`    ${(p.full_name ?? "").padEnd(22)} ${(p.role ?? "").padEnd(6)} ${p.email ?? "(no login)"}`);
  }
  console.log("\n  DELETE:");
  for (const p of targets) {
    const seen = p.last_sign_in_at ? String(p.last_sign_in_at).slice(0, 10) : "never signed in";
    console.log(
      `    ${(p.full_name ?? "").padEnd(22)} ${(p.role ?? "").padEnd(6)} ${(p.email ?? "(no login)").padEnd(34)} ${seen}`
    );
  }

  if (!targets.length) {
    console.log("\n  Nothing to delete — profiles already match the staff list.\n");
    await sql.end();
    process.exit(0);
  }

  // Guard 1: never delete an account someone can still log in with.
  const stillActive = targets.filter((p) => p.is_active);
  if (stillActive.length) {
    console.error(
      `\n  ABORT — ${stillActive.length} target account(s) are still ACTIVE: ` +
        stillActive.map((p) => p.full_name).join(", ")
    );
    console.error("  Deactivate them in the Users screen first, so the decision is auditable.\n");
    await sql.end();
    process.exit(1);
  }

  // Guard 2: never delete an account the ledger still points at.
  const ids = targets.map((p) => p.id);
  const blockers = [];
  for (const [table, column] of REFS) {
    const r = await sql`
      SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(column)} = ANY(${ids}::uuid[])`;
    if (r[0].n > 0) blockers.push(`${table}.${column} → ${r[0].n} row(s)`);
  }
  if (blockers.length) {
    console.error("\n  ABORT — these accounts are still referenced by the ledger:");
    for (const b of blockers) console.error(`    ${b}`);
    console.error("  A user who touched a sealed invoice is part of the record and stays.\n");
    await sql.end();
    process.exit(1);
  }
  console.log("\n  Ledger reference check: clean (no invoices, events, payments or settings name them).");

  if (!confirm) {
    console.log("\n  DRY RUN — nothing was changed.\n  Re-run with  --confirm  to delete.\n");
    await sql.end();
    process.exit(0);
  }

  // Backup before deleting: the profile row plus the auth identity fields worth
  // keeping. Password hashes are deliberately NOT exported.
  const backupProfiles = await sql`SELECT * FROM public.profiles WHERE id = ANY(${ids}::uuid[])`;
  const backupAuth = await sql`
    SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
    FROM auth.users WHERE id = ANY(${ids}::uuid[])`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-purge-accounts-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ profiles: backupProfiles, auth_users: backupAuth }, null, 2));
  console.log(`\n  Backup written: ${file}`);

  const deleted = await sql`DELETE FROM auth.users WHERE id = ANY(${ids}::uuid[]) RETURNING id, email`;
  const left = await sql`SELECT count(*)::int AS n FROM public.profiles`;
  console.log(`\n  Deleted ${deleted.length} account(s). profiles now holds ${left[0].n} row(s).`);
  console.log(
    left[0].n === KEEP.length
      ? "  DONE ✅ only the four real staff accounts remain.\n"
      : "  WARNING: profile count does not equal the KEEP list — inspect before trusting.\n"
  );
  await sql.end();
} catch (e) {
  console.error("\n  ERROR:", e.message, "\n");
  await sql.end().catch(() => {});
  process.exit(1);
}
