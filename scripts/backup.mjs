// Task 7.6 [#27] — monthly backup export (F-3/D-06 retention & continuity).
// Run: node --env-file=.env.local scripts/backup.mjs [output-dir]
//
// Dumps the public schema (the business ledger: invoices, children,
// payments, events, customers, services, settings, profiles) in pg_dump
// custom format. Supabase-managed schemas (auth, storage, realtime) are
// intentionally out of scope — Supabase Pro's daily backups cover the full
// project; THIS export is the client-owned continuity copy of the ledger
// that must survive even losing the Supabase account (FTA 5-year
// retention).
//
// Requirements:
// - pg_dump v17+ on PATH, or PG_BIN=<dir containing pg_dump(.exe)>
// - DATABASE_URL_MIGRATIONS in .env.local (session pooler :5432 —
//   pg_dump cannot ride the transaction pooler)
//
// Restore/verify ritual: see docs/RUNBOOK-backup-restore.md and
// scripts/restore-drill.mjs.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dbUrl = process.env.DATABASE_URL_MIGRATIONS;
if (!dbUrl) {
  console.error("DATABASE_URL_MIGRATIONS is not set — run with --env-file=.env.local");
  process.exit(1);
}

const outDir = process.argv[2] ?? "backups";
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outFile = join(outDir, `invoice-ledger-${stamp}.dump`);

const exe = process.env.PG_BIN
  ? join(process.env.PG_BIN, process.platform === "win32" ? "pg_dump.exe" : "pg_dump")
  : "pg_dump";

const res = spawnSync(
  exe,
  ["--format=custom", "--schema=public", "--no-owner", "--no-privileges", `--file=${outFile}`, dbUrl],
  { stdio: "inherit" }
);
if (res.error) {
  console.error(`Could not run ${exe}: ${res.error.message}`);
  console.error("Install PostgreSQL 17 client tools or set PG_BIN to their bin directory.");
  process.exit(1);
}
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`\nBackup written: ${outFile}`);
console.log("Copy it to the client-owned storage location (RUNBOOK step 2) — the local copy is not the backup.");
