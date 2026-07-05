// Task 5.2 acceptance tests — customer ledger (invoices + payments + balances).
// Run: pnpm build && pnpm test:db:5.2   (spawns `next start` on :3122)
//
// Proves the balance math: invoiced/paid/outstanding count ISSUED invoices
// only (drafts owe nothing, voided are out of force), and the ledger page
// renders invoices, payments incl. reversal rows, and the totals. DESTRUCTIVE.

import { spawn } from "node:child_process";
import postgres from "postgres";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl?.includes(STAGING_REF) || !SUPA_URL?.includes(STAGING_REF)) {
  console.error("Refusing to run: not the staging project.");
  process.exit(1);
}
const APP = "http://127.0.0.1:3122";
const PASSWORD = "Ledg-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));

async function gotrue(method, path, body) {
  const res = await fetch(`${SUPA_URL}/auth/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GoTrue ${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function ensureUser(email) {
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) await gotrue("DELETE", `/admin/users/${existing.id}`);
  return (await gotrue("POST", "/admin/users", { email, password: PASSWORD, email_confirm: true }))
    .id;
}
async function signIn(email) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`password grant ${email}: ${res.status} ${await res.text()}`);
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
const probe = (path, session) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — ledger fixtures, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Ledger Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name, trn)
  values ('regular', 'Ledger Client LLC', '100000000000003') returning id`;
const [other] = await sql`insert into customers (type, name) values ('walk_in', 'Other Person') returning id`;
let [method] = await sql`select id from payment_methods where is_active limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

async function mkSealed(customerId, serviceFils) {
  const [inv] = await sql`insert into invoices (customer_id) values (${customerId}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Svc', 1, 0, ${serviceFils})`;
  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;
  return sealed;
}

// Fixtures for the ledger customer:
//   INV-1: 105000 fils, paid 40000 then 10000 reversed → net paid 30000
//   INV-2: 105000 fils, unpaid
//   one open draft, one voided (must NOT count in balances)
const inv1 = await mkSealed(cust.id, 100000);
await mkSealed(cust.id, 100000); // INV-2, stays unpaid
await sql`insert into invoices (customer_id) values (${cust.id})`; // draft
const voided = await mkSealed(cust.id, 100000);
await sql`update invoices set status='voided', voided_at=now(), void_reason='t' where id = ${voided.id}`;
// Someone else's invoice — must not leak into this ledger.
await mkSealed(other.id, 50000);

const [pay1] = await sql`insert into payments (invoice_id, amount, method_id, received_on)
  values (${inv1.id}, 40000, ${method.id}, '2026-07-01') returning id`;
await sql`insert into payments (invoice_id, amount, method_id, received_on, reverses_payment_id, reference)
  values (${inv1.id}, -10000, ${method.id}, '2026-07-02', ${pay1.id}, 'partial reversal')`;

const staffId = await ensureUser("ledg-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Ledg Staff', 'staff', true)`;
const staffSession = await signIn("ledg-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3122"], {
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
  process.exit(1);
}

try {
  /* ═══ G1 — gating ══════════════════════════════════════════════════════ */
  console.log("G1 — gating");
  {
    const anon = await probe(`/customers/${cust.id}`, null);
    ok([301, 302, 303, 307, 308].includes(anon.status), "anon → redirect to login");
    // With the (shell) loading.tsx boundary, notFound() can stream inside a
    // 200 instead of a raw HTTP 404 — accept either form.
    const isNotFound = async (res) =>
      res.status === 404 || /could not be found|404/i.test(await res.text());
    ok(await isNotFound(await probe(`/customers/not-a-uuid`, staffSession)), "malformed id → not-found");
    ok(
      await isNotFound(
        await probe(`/customers/00000000-0000-4000-8000-000000000000`, staffSession)
      ),
      "unknown customer → not-found"
    );
  }

  /* ═══ G2 — balances: issued only, voided/drafts excluded ═══════════════ */
  console.log("G2 — balances");
  {
    const page = await probe(`/customers/${cust.id}`, staffSession);
    const html = await page.text();
    ok(page.status === 200 && html.includes("Ledger Client LLC"), "ledger renders");
    // invoiced = 2 × 105000 = 210000 → "2,100.00" (voided 105000 EXCLUDED)
    ok(html.includes("2,100.00"), "invoiced counts the two sealed invoices only");
    // paid = 40000 − 10000 reversal = 30000 → "300.00"
    ok(html.includes("300.00"), "paid nets the reversal");
    // outstanding = 210000 − 30000 = 180000 → "1,800.00"
    ok(html.includes("1,800.00"), "outstanding = invoiced − paid");
    ok(html.includes("INV-1") && html.includes("INV-2") && html.includes("INV-3"),
      "all documents listed (incl. the voided one, marked)");
    ok(html.includes("draft"), "open draft listed");
    ok(html.includes("partial reversal") || html.includes("reversal"),
      "reversal row visible in the payments section");
    ok(!html.includes("INV-4"), "another customer's invoice does NOT leak in");
  }

  /* ═══ G3 — navigation entry points ═════════════════════════════════════ */
  console.log("G3 — entry points");
  {
    const list = await probe("/customers", staffSession);
    const html = await list.text();
    ok(html.includes(`/customers/${cust.id}`), "customers list links into the ledger");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
