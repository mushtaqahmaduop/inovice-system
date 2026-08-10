// Global search acceptance tests (owner report, 2026-07-27: "search should
// find invoices by number and customers by name").
// Run: pnpm build && pnpm test:db:search   (spawns `next start` on :3150)
//
// The bug this pins down: /api/search demanded two characters, so with
// invoice numbers INV-1 … INV-9 typing the number returned a 400 and an empty
// palette. NON-DESTRUCTIVE — it adds one customer and removes it at the end,
// and reads whatever sealed invoices staging already holds.

import { spawn } from "node:child_process";
import postgres from "postgres";

import { assertNotProduction } from "../guard.mjs";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
assertNotProduction("search");
const APP = "http://127.0.0.1:3150";
// Shares the draft-delete suite's staff identity — one reusable staging test
// user rather than a new one per suite.
const STAFF = "draft-del-staff@staging.test";
const PASSWORD = "Draft-Delete-Test-2026!";
const PHONE = "050-771-9042";
const NAME = "Zafar Search Fixture";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));

async function gotrue(method, path, body, token) {
  const res = await fetch(`${SUPA_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: token ? ANON_KEY : SERVICE_KEY,
      Authorization: `Bearer ${token ?? SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GoTrue ${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function ensureStaff() {
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const existing = (list.users ?? []).find((u) => u.email === STAFF);
  const id = existing
    ? (await gotrue("PUT", `/admin/users/${existing.id}`, { password: PASSWORD })).id
    : (
        await gotrue("POST", "/admin/users", {
          email: STAFF,
          password: PASSWORD,
          email_confirm: true,
        })
      ).id;
  await sql`insert into profiles (id, full_name, role, is_active)
    values (${id}, 'Draft-Delete Staff', 'staff', true)
    on conflict (id) do update set is_active = true`;
  return id;
}
async function signIn() {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: STAFF, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`password grant: ${res.status} ${await res.text()}`);
  return res.json();
}
const projectRef = new URL(SUPA_URL).host.split(".")[0];
function cookieFor(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${projectRef}-auth-token`;
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++)
    parts.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}

console.log("setup — fixture customer, next start");
await ensureStaff();
const session = await signIn();
const [cust] = await sql`insert into customers (type, name, phone)
  values ('walk_in', ${NAME}, ${PHONE}) returning id`;
const [dead] = await sql`insert into customers (type, name, phone, deleted_at)
  values ('walk_in', ${NAME + " (closed)"}, ${PHONE}, now()) returning id`;
const sealed = await sql`select invoice_number from invoices
  where status = 'issued' and invoice_number is not null order by number_seq limit 2`;

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3150"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const up = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${APP}/login`)).status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
})();
if (!up) {
  console.error("next start never became ready.\n" + serverLog.slice(-2000));
  server.kill();
  await sql`delete from customers where id in (${cust.id}, ${dead.id})`.catch(() => {});
  await sql.end();
  process.exit(1);
}

const search = async (q, withSession = true) => {
  const res = await fetch(`${APP}/api/search?q=${encodeURIComponent(q)}`, {
    headers: withSession ? { cookie: cookieFor(session) } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const numbers = (r) => (r.body?.invoices ?? []).map((i) => i.invoice_number);
const custNames = (r) => (r.body?.customers ?? []).map((c) => c.name);

try {
  /* ═══ S1 — invoice numbers, typed the way people type them ════════════ */
  console.log("S1 — invoice by number");
  if (sealed.length === 0) {
    ok(false, "expected at least one sealed invoice on staging");
  } else {
    const first = sealed[0].invoice_number; // e.g. INV-1
    const seq = first.replace(/\D+/g, ""); // "1"
    for (const typed of [seq, first, first.toLowerCase(), `inv${seq}`, `#${seq}`, `INV ${seq}`]) {
      const r = await search(typed);
      ok(r.status === 200 && numbers(r).includes(first), `"${typed}" finds ${first}`);
    }
  }

  /* ═══ S2 — customers by name and by phone ═════════════════════════════ */
  console.log("S2 — customer by name / phone");
  {
    const byName = await search("Zafar");
    ok(custNames(byName).includes(NAME), `"Zafar" finds ${NAME}`);

    const byLater = await search("Search Fixture");
    ok(custNames(byLater).includes(NAME), "a middle-of-the-name fragment also finds it");

    const byPhone = await search("7719042".slice(0, 4));
    ok(byPhone.status === 200, "a phone fragment is a valid query");
    const byFullPhone = await search(PHONE);
    ok(custNames(byFullPhone).includes(NAME), "the full phone number finds the customer");

    ok(
      !custNames(byName).includes(NAME + " (closed)"),
      "a deleted customer stays out of the results"
    );
  }

  /* ═══ S3 — edges ══════════════════════════════════════════════════════ */
  console.log("S3 — edges");
  {
    const anon = await search("1", false);
    ok(anon.status === 401, "unauthenticated → 401");

    const empty = await search("");
    ok(empty.status === 400, "empty query → 400");

    const wild = await search("%%");
    ok(wild.status === 200, "a query of only wildcards is handled, not 500");

    const long = await search("x".repeat(80));
    ok(long.status === 400, "over-long query → 400");
  }
} catch (err) {
  failed++;
  console.error(`  ✗ the run threw before finishing: ${err?.message ?? err}`);
} finally {
  server.kill();
  await sql`delete from customers where id in (${cust.id}, ${dead.id})`.catch(() => {});
  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}
