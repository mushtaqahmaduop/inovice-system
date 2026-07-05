// Task 7.1 acceptance tests — dashboard (outstanding balances first).
// Run: pnpm build && pnpm test:db:7.1   (spawns `next start` on :3126)
//
// Proves the client's named report: "who still owes our money" — open
// balances per customer from sealed values, paid customers absent,
// monthly totals and recent activity render. DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3126";
const PASSWORD = "Dash-Test-Only-2026!";
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
console.log("setup — debtors, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format, due_days_default)
          values ('Dash Test Co', true, 500, 'INV-{NN}', 7)`;
const [debtorBig] = await sql`insert into customers (type, name) values ('regular', 'Big Debtor LLC') returning id`;
const [debtorSmall] = await sql`insert into customers (type, name) values ('walk_in', 'Small Debtor') returning id`;
const [paidCust] = await sql`insert into customers (type, name) values ('regular', 'Fully Paid Co') returning id`;
let [method] = await sql`select id from payment_methods where is_active limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

async function mkSealed(customerId, serviceFils) {
  const [inv] = await sql`insert into invoices (customer_id) values (${customerId}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Svc', 1, 0, ${serviceFils})`;
  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;
  return sealed;
}

// Big Debtor: two invoices, 105000 each, no payments → owes 210000.
await mkSealed(debtorBig.id, 100000);
await mkSealed(debtorBig.id, 100000);
// Small Debtor: 105000, paid 100000 → owes 5000.
const small = await mkSealed(debtorSmall.id, 100000);
await sql`insert into payments (invoice_id, amount, method_id, received_on)
  values (${small.id}, 100000, ${method.id}, current_date)`;
// Fully Paid: settled — must NOT appear among debtors.
const paid = await mkSealed(paidCust.id, 100000);
await sql`insert into payments (invoice_id, amount, method_id, received_on)
  values (${paid.id}, 105000, ${method.id}, current_date)`;

const staffId = await ensureUser("dash-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Dash Staff', 'staff', true)`;
const staffSession = await signIn("dash-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3126"], {
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
  console.log("D — dashboard");
  {
    const anon = await probe("/dashboard", null);
    ok([301, 302, 303, 307, 308].includes(anon.status), "anon → redirect to login");
    const page = await probe("/dashboard", staffSession);
    const html = await page.text();
    ok(page.status === 200, "staff renders the dashboard");
    // Outstanding total = 210000 + 5000 = 215000 → "2,150.00"
    ok(html.includes("2,150.00"), "outstanding total correct (who owes us)");
    ok(html.includes("Big Debtor LLC") && html.includes("2,100.00"),
      "top debtor listed with open balance");
    ok(html.includes("Small Debtor") && html.includes("50.00"), "partial payer listed with remainder");
    ok(!html.includes("Fully Paid Co"), "settled customer ABSENT from debtors");
    ok(html.indexOf("Big Debtor LLC") < html.indexOf("Small Debtor"),
      "debtors sorted largest first");
    // This month: all 4 sealed today = 420000 → "4,200.00"; VAT 4×5000 → "200.00"
    ok(html.includes("4,200.00"), "invoiced-this-month total");
    ok(html.includes("4 sealed"), "sealed count this month");
    ok(html.includes("200.00"), "VAT collected this month");
    ok(html.includes("issued"), "recent activity shows events");
    ok(html.includes(`/customers/${debtorBig.id}`), "debtor rows link into the ledger");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
