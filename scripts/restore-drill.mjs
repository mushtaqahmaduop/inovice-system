// Task 7.6 [#27] — backup/restore drill (F-3/D-06).
// Run: node --env-file=.env.local scripts/restore-drill.mjs <backup.dump>
//
// Proves a backup is actually restorable: boots a THROWAWAY local
// PostgreSQL (initdb + pg_ctl from PG_BIN — no install, no admin), restores
// the dump into it, then verifies EVERY sealed invoice two ways:
//   1. internal consistency — sealed subtotals recomputed from the restored
//      lines (sum of qty × unit fee) match the sealed columns;
//   2. source equality — sealed totals, line counts/sums and payment sums
//      in the restored copy equal the live database row-for-row.
// Done-criterion (BUILD_PHASES 7.6): a restored invoice matches its sealed
// totals.
//
// Requirements:
// - PG_BIN=<dir with initdb/pg_ctl/postgres/psql/pg_restore v17+>
//   (full server binaries, e.g. github.com/theseus-rs/postgresql-binaries)
// - DATABASE_URL_MIGRATIONS in .env.local (only READ for the comparison)
//
// Expected restore noise (reported, tolerated): the dump is public-schema
// only, so objects referencing Supabase's auth schema — the profiles→
// auth.users FK and auth.uid() inside RLS policies — cannot be recreated
// in the scratch server. Stubs for auth.uid()/auth.jwt() are pre-created
// to keep most of them; what still fails is access control, never ledger
// data. The drill fails hard if any DATA verification mismatches.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const DUMP = process.argv[2];
if (!DUMP || !existsSync(DUMP)) {
  console.error("Usage: node --env-file=.env.local scripts/restore-drill.mjs <backup.dump>");
  process.exit(1);
}
const PG_BIN = process.env.PG_BIN;
if (!PG_BIN) {
  console.error("Set PG_BIN to a directory containing PostgreSQL 17 server binaries.");
  process.exit(1);
}
const liveUrl = process.env.DATABASE_URL_MIGRATIONS;
if (!liveUrl) {
  console.error("DATABASE_URL_MIGRATIONS is not set — run with --env-file=.env.local");
  process.exit(1);
}

const exe = (name) => join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const PORT = process.env.DRILL_PORT ?? "5599";
const dataDir = mkdtempSync(join(tmpdir(), "invoice-drill-"));
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(exe(cmd), args, { encoding: "utf8", ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return r;
};

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));

let serverStarted = false;
try {
  /* ── scratch server ─────────────────────────────────────────────────── */
  console.log(`setup — initdb + pg_ctl on :${PORT} (${dataDir})`);
  let r = run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  if (r.status !== 0) throw new Error(`initdb failed:\n${r.stderr}`);
  // stdio must be ignored: the spawned daemon inherits piped handles on
  // Windows and spawnSync would wait on the pipes forever. Server output
  // goes to server.log via -l instead.
  r = run(
    "pg_ctl",
    [
      "-D",
      dataDir,
      "-w",
      "-t",
      "60",
      "-o",
      `-p ${PORT} -c listen_addresses=127.0.0.1`,
      "-l",
      join(dataDir, "server.log"),
      "start",
    ],
    { stdio: "ignore" }
  );
  if (r.status !== 0) throw new Error(`pg_ctl start failed — see ${join(dataDir, "server.log")}`);
  serverStarted = true;

  const psql = (sqlText, db = "postgres") =>
    run("psql", [
      "-h",
      "127.0.0.1",
      "-p",
      PORT,
      "-U",
      "postgres",
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sqlText,
    ]);

  psql("CREATE DATABASE drill");
  // Stubs for what the public-schema dump references but Supabase owns.
  psql(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN",
    "drill"
  );
  psql(
    "CREATE SCHEMA auth; " +
      "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid'; " +
      "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$",
    "drill"
  );
  psql("CREATE EXTENSION IF NOT EXISTS pg_trgm", "drill");

  /* ── restore ────────────────────────────────────────────────────────── */
  console.log("restore — pg_restore into scratch db 'drill'");
  r = run("pg_restore", [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-U",
    "postgres",
    "-d",
    "drill",
    "--no-owner",
    "--no-privileges",
    DUMP,
  ]);
  const restoreErrors = (r.stderr.match(/pg_restore: error:/g) ?? []).length;
  const authRelated = (r.stderr.match(/auth\.(users|uid|jwt)|does not exist/g) ?? []).length;
  console.log(
    `  pg_restore finished — ${restoreErrors} error(s), auth-schema-related mentions: ${authRelated}`
  );
  if (restoreErrors > 0)
    console.log(
      r.stderr
        .split("\n")
        .filter((l) => l.includes("error:"))
        .slice(0, 10)
        .join("\n")
    );

  /* ── verify ─────────────────────────────────────────────────────────── */
  console.log("verify — every sealed invoice, restored vs recomputed vs live");
  const drill = postgres(`postgres://postgres@127.0.0.1:${PORT}/drill`, {
    max: 1,
    onnotice: () => {},
  });
  const live = postgres(liveUrl, { max: 1, onnotice: () => {} });

  const VERIFY_SQL = (sql) => sql`
    select i.id, i.invoice_number,
           i.subtotal_govt, i.subtotal_service, i.subtotal_extras, i.vat_amount, i.grand_total,
           (select count(*)::int from invoice_lines l where l.invoice_id = i.id) as line_count,
           (select coalesce(sum(l.qty * l.govt_fee), 0)::bigint from invoice_lines l where l.invoice_id = i.id) as calc_govt,
           (select coalesce(sum(l.qty * l.service_fee), 0)::bigint from invoice_lines l where l.invoice_id = i.id) as calc_service,
           (select coalesce(sum(l.vat_amount), 0)::bigint from invoice_lines l where l.invoice_id = i.id) as calc_vat,
           (select count(*)::int from payments p where p.invoice_id = i.id) as pay_count,
           (select coalesce(sum(p.amount), 0)::bigint from payments p where p.invoice_id = i.id) as pay_sum
      from invoices i
     where i.status in ('issued', 'voided') and i.invoice_number is not null
     order by i.number_year, i.number_seq`;

  const restored = await VERIFY_SQL(drill);
  // DNS to *.pooler.supabase.com is flaky on some networks — retry the
  // live read a few times before declaring the drill failed.
  let source;
  for (let attempt = 1; ; attempt++) {
    try {
      source = await VERIFY_SQL(live);
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`  live read failed (${e.message}) — retry ${attempt}/3 in 5s`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
  ok(restored.length > 0, `restored copy contains sealed invoices (${restored.length})`);
  ok(
    restored.length === source.length,
    `sealed invoice count matches live (${restored.length} = ${source.length})`
  );

  let internalBad = 0;
  for (const inv of restored) {
    if (
      BigInt(inv.calc_govt) !== BigInt(inv.subtotal_govt) ||
      BigInt(inv.calc_service) !== BigInt(inv.subtotal_service) ||
      BigInt(inv.calc_vat) !== BigInt(inv.vat_amount)
    ) {
      internalBad++;
      console.error(`    mismatch (internal): ${inv.invoice_number}`);
    }
  }
  ok(
    internalBad === 0,
    `sealed subtotals + VAT recompute exactly from restored lines (${restored.length} invoices)`
  );

  const byId = new Map(source.map((r0) => [r0.id, r0]));
  let crossBad = 0;
  for (const inv of restored) {
    const src = byId.get(inv.id);
    const same =
      src &&
      [
        "subtotal_govt",
        "subtotal_service",
        "subtotal_extras",
        "vat_amount",
        "grand_total",
        "line_count",
        "pay_count",
      ].every((k) => String(inv[k]) === String(src[k])) &&
      BigInt(inv.pay_sum) === BigInt(src.pay_sum);
    if (!same) {
      crossBad++;
      console.error(`    mismatch (vs live): ${inv.invoice_number}`);
    }
  }
  ok(crossBad === 0, `restored totals, line counts and payment sums equal live row-for-row`);

  const [{ n: eventCountDrill }] = await drill`select count(*)::int as n from invoice_events`;
  const [{ n: eventCountLive }] = await live`select count(*)::int as n from invoice_events`;
  ok(
    eventCountDrill === eventCountLive,
    `append-only event log fully present (${eventCountDrill} = ${eventCountLive})`
  );

  await drill.end();
  await live.end();
} catch (e) {
  failed++;
  console.error(`DRILL ERROR: ${e.message}`);
} finally {
  if (serverStarted) run("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "ignore" });
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows can hold locks briefly; the dir lives in tmp either way.
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
