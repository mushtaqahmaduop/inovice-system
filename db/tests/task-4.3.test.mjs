// Task 4.3 acceptance tests — invoice list + invoice_list view (migration 0009).
// Run: pnpm build && pnpm test:db:4.3   (spawns `next start` on :3119)
//
// Proves the SCHEMA_DESIGN §6 semantics: payment_status derived purely from
// SUM(payments) (unpaid → partial → paid; overpayment still 'paid';
// draft/voided → NULL), and that security_invoker keeps RLS on the caller —
// anon reads NOTHING through the view even though rows exist. DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3119";
const PASSWORD = "List-Test-Only-2026!";
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
// Direct PostgREST read of the view — the RLS-through-view proof.
const restList = (token) =>
  fetch(`${SUPA_URL}/rest/v1/invoice_list?select=id,payment_status`, {
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — fixtures through issue_invoice(), users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format, due_days_default)
          values ('List Test Co', true, 500, 'INV-{NN}', 14)`;
const [cust] = await sql`insert into customers (type, name) values ('regular', 'List Client') returning id`;
let [method] = await sql`select id from payment_methods limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

async function mkIssued() {
  const [inv] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Service', 1, 0, 100000)`; // grand: 100000 + 5000 VAT = 105000
  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;
  return sealed;
}

const [draft] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${draft.id}, 1, 'Draft line', 1, 0, 5000)`;
const inv1 = await mkIssued(); // stays unpaid
const inv2 = await mkIssued(); // partial → paid → overpaid
const inv3 = await mkIssued(); // voided below
await sql`update invoices set status='voided', voided_at=now(), void_reason='test' where id = ${inv3.id}`;

const staffId = await ensureUser("list-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'List Staff', 'staff', true)`;
const staffSession = await signIn("list-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3119"], {
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

const status = async (id) => {
  const [r] = await sql`select payment_status, paid_total from invoice_list where id = ${id}`;
  return r;
};

try {
  /* ═══ L1 — derived payment status, purely from the payments sum ════════ */
  console.log("L1 — §6 payment_status semantics");
  {
    ok((await status(draft.id)).payment_status === null, "draft → NULL");
    ok((await status(inv3.id)).payment_status === null, "voided → NULL");
    ok((await status(inv1.id)).payment_status === "unpaid", "issued, no payments → unpaid");

    await sql`insert into payments (invoice_id, amount, method_id, received_on)
      values (${inv2.id}, 40000, ${method.id}, current_date)`;
    ok((await status(inv2.id)).payment_status === "partial", "40k of 105k → partial");

    await sql`insert into payments (invoice_id, amount, method_id, received_on)
      values (${inv2.id}, 65000, ${method.id}, current_date)`;
    ok((await status(inv2.id)).payment_status === "paid", "sum reaches grand_total → paid");

    await sql`insert into payments (invoice_id, amount, method_id, received_on)
      values (${inv2.id}, 10000, ${method.id}, current_date)`;
    const over = await status(inv2.id);
    ok(over.payment_status === "paid" && Number(over.paid_total) === 115000,
      "overpayment still reads 'paid' (flagged in UI, not an error)");

    // Reversal row (negative) drops it back below the total.
    await sql`insert into payments (invoice_id, amount, method_id, received_on)
      values (${inv2.id}, -20000, ${method.id}, current_date)`;
    ok((await status(inv2.id)).payment_status === "partial",
      "negative reversal row flows straight into the derived status");
  }

  /* ═══ L2 — security_invoker: RLS binds the view ════════════════════════ */
  console.log("L2 — RLS through the view");
  {
    const anonRes = await restList(null);
    const anonRows = anonRes.ok ? await anonRes.json() : [];
    ok(anonRows.length === 0, "anon sees ZERO rows through the view (security_invoker)");
    const staffRes = await restList(staffSession.access_token);
    const staffRows = await staffRes.json();
    ok(Array.isArray(staffRows) && staffRows.length === 4, "staff sees all 4 via PostgREST");
  }

  /* ═══ L3 — the /invoices page ══════════════════════════════════════════ */
  console.log("L3 — page");
  {
    const anon = await probe("/invoices", null);
    ok([301, 302, 303, 307, 308].includes(anon.status), "anon → redirect to login");
    const page = await probe("/invoices", staffSession);
    const html = await page.text();
    ok(page.status === 200, "staff renders /invoices");
    ok(html.includes("INV-1") && html.includes("INV-2") && html.includes("INV-3"),
      "all sealed numbers render");
    ok(html.includes("List Client"), "customer names render (snapshot + join for drafts)");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
