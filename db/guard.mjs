// Environment guard for DESTRUCTIVE database scripts (audit F-3, 2026-08-10).
//
// The problem this fixes: every task test carried its own copy of
//
//     const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
//     if (!dbUrl?.includes(STAGING_REF)) { refuse }
//
// which was correct while that project was staging. At go-live the same
// project became PRODUCTION — the client's real ledger — and nobody edited 25
// files. The guard inverted: it stopped being "only run on staging" and became
// "only run on production", i.e. a permission slip for the one database that
// must never be touched by a test. `pnpm db:reseed` had no ref check at all.
//
// The rule now FAILS CLOSED. A destructive script runs only against a database
// this file can positively identify as disposable:
//
//   1. a ref in PRODUCTION_REFS is refused outright, with no override. There is
//      no env var, no flag, no "yes I'm sure". Sealed invoices cannot be
//      deleted by design (CLAUDE.md §3.1), so a test that writes into the live
//      ledger is not recoverable by any means short of TRUNCATE;
//   2. anything else must be DECLARED disposable — DB_ENV=staging|development|
//      test, or a localhost connection. An unrecognised database is refused,
//      because "I don't know what this is" must never resolve to "go ahead".
//
// Read-only and operator tools deliberately do NOT call this: `pnpm audit:db`,
// `db:backup`, `db:drill` and `wipe-demo.mjs` are meant to run against
// production and carry their own confirmations.
//
// When a real staging project exists again, add nothing here — just set
// DB_ENV=staging in that machine's .env.local. This file only ever needs
// editing when a NEW production project is created.

/** Supabase project refs that hold real client data. Never test against these. */
const PRODUCTION_REFS = ["kxtbxgcvwxvlsoygjvvi"];

/** Values of DB_ENV that positively declare a throwaway database. */
const DISPOSABLE_ENVS = ["staging", "development", "test"];

function fail(script, lines) {
  console.error(`\n  REFUSING TO RUN — ${script}\n  ${"-".repeat(52)}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(1);
}

/**
 * Abort the process unless the configured database is safe to destroy.
 * Reads the same env vars the scripts themselves use.
 *
 * @param {string} script  label for the error message, e.g. "task-5.2"
 */
export function assertNotProduction(script = "destructive script") {
  const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dbEnv = (process.env.DB_ENV ?? "").trim().toLowerCase();

  if (!dbUrl) {
    fail(script, [
      "No DATABASE_URL_MIGRATIONS / DATABASE_URL is set.",
      "Run via pnpm (which passes --env-file=.env.local).",
    ]);
  }

  const hitRef = PRODUCTION_REFS.find((ref) => dbUrl.includes(ref) || supaUrl.includes(ref));
  if (hitRef) {
    fail(script, [
      `This is the PRODUCTION database (project ${hitRef}).`,
      "It holds the client's real invoices, customers and audit log.",
      "",
      "This script writes and truncates. Issued invoices are immutable by",
      "law and by trigger — data written here cannot be cleanly removed.",
      "",
      "There is no override flag, and that is deliberate. To run these",
      "tests, point .env.local at a disposable Supabase project and set",
      "DB_ENV=staging in that file.",
    ]);
  }

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
  if (!DISPOSABLE_ENVS.includes(dbEnv) && !isLocal) {
    fail(script, [
      "Cannot confirm this database is disposable, so it is refused.",
      "",
      `  DB_ENV     = ${dbEnv === "" ? "(not set)" : dbEnv}`,
      `  database   = ${describeTarget(dbUrl)}`,
      "",
      `Set DB_ENV to one of: ${DISPOSABLE_ENVS.join(", ")} — in the .env file`,
      "of a project you are willing to lose. A database that is not",
      "declared disposable is treated as production.",
    ]);
  }
}

/** Host + Supabase ref of a connection string, with credentials stripped. */
function describeTarget(dbUrl) {
  try {
    const u = new URL(dbUrl);
    const ref = /postgres\.([a-z0-9]+)/.exec(u.username ?? "")?.[1];
    return ref ? `${u.hostname} (project ${ref})` : u.hostname;
  } catch {
    return "unparseable connection string";
  }
}
