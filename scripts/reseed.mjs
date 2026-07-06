// Reseed ritual, scripted (replaces the manual dance in FINDINGS/session
// notes). Destructive test suites leave staging with a test-fixture
// settings row ("Rt Test Co" etc.) and missing seed data. This restores
// the canonical state in one command:
//
//   node --env-file=.env.local scripts/reseed.mjs [--demo]
//   (pnpm db:reseed [-- --demo])
//
// 1. truncate settings (the seed only inserts when the table is empty, so
//    a fixture row would otherwise stick — the original gotcha);
// 2. run db/seed.mjs (idempotent: admin user, payment methods, demo data
//    with --demo). SEED_ADMIN_EMAIL defaults to the operator account;
// 3. apply the LAUNCH PROFILE over the placeholder settings row — values
//    are the client's answers recorded in DECISIONS.md (Q-02 details,
//    Q-03 deregistered launch, Q-11 due days). Update THERE first if the
//    client revises anything; this script mirrors, never decides.

import { spawnSync } from "node:child_process";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL_MIGRATIONS is not set — run with --env-file=.env.local");
  process.exit(1);
}

// DECISIONS.md §B — Q-02 (2026-07-05 batches + Mushtaq's 3rd instruction),
// Q-03 (deregistered launch: no VAT printed, TRN stored-not-printed once
// supplied), Q-11 (due = 7 days). logo_path stays null until the real
// file arrives (the only remaining 6.1 blocker).
const LAUNCH_PROFILE = {
  company_name: "Prestige Land Typing Center",
  address: "Bawabat Al Sharq St., Civic Center Al Jimi, Al Ain, United Arab Emirates",
  phone: "+971 50 986 0956 · +971 50 714 2037",
  email: "Prestigelandtyping@gmail.com",
  trn: null,
  vat_registered: false,
  vat_rate_bp: 500,
  due_days_default: 7,
};

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

console.log("1/3 truncate settings (evicts any test-fixture row)");
await sql`truncate table settings`;

console.log("2/3 run seed" + (process.argv.includes("--demo") ? " --demo" : ""));
const seedArgs = ["--env-file=.env.local", "db/seed.mjs"];
if (process.argv.includes("--demo")) seedArgs.push("--demo");
const res = spawnSync(process.execPath, seedArgs, {
  stdio: "inherit",
  env: { SEED_ADMIN_EMAIL: "mushtaqkmcite@gmail.com", ...process.env },
});
if (res.status !== 0) {
  console.error("seed failed — settings are still the bare placeholder row.");
  await sql.end();
  process.exit(res.status ?? 1);
}

console.log("3/3 apply launch profile (DECISIONS Q-02/Q-03/Q-11)");
await sql`update settings set ${sql(LAUNCH_PROFILE)}`;
const [row] = await sql`
  select company_name, vat_registered, due_days_default from settings`;
console.log(
  `   settings → "${row.company_name}", vat_registered=${row.vat_registered}, due_days_default=${row.due_days_default}`
);
await sql.end();
console.log("\nReseed complete.");
