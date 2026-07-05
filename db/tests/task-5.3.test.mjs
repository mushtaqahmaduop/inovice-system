// Task 5.3 acceptance tests — invoice event timeline (the audit story).
// Run: pnpm build && pnpm test:db:5.3   (spawns `next start` on :3123)
//
// Proves the detail view renders the full append-only history in order —
// created → issued → payment → reversal → print → voided — with actors
// and payload details (amounts, void reason). DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3123";
const PASSWORD = "Time-Test-Only-2026!";
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
const probe = (path, session, init = {}) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(session ? { cookie: cookieFor(session) } : {}),
      ...(init.headers ?? {}),
    },
  });
const post = (path, session, body) =>
  probe(path, session, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — full-lifecycle invoice, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Time Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name) values ('regular', 'Time Client') returning id`;
let [method] = await sql`select id from payment_methods where is_active limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

const [inv] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${inv.id}, 1, 'Svc', 1, 0, 100000)`;
await sql`insert into invoice_events (invoice_id, event_type, payload)
  values (${inv.id}, 'created', '{"lines":1}')`; // API normally writes this
await sql`select * from issue_invoice(${inv.id})`;

const staffId = await ensureUser("time-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Time Staff', 'staff', true)`;
const staffSession = await signIn("time-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3123"], {
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
  // Drive the rest of the lifecycle through the real APIs so events carry
  // the staff actor.
  const pay = await post(`/api/invoices/${inv.id}/payments`, staffSession, {
    type: "record",
    amount: 40000,
    methodId: method.id,
    receivedOn: "2026-07-05",
  });
  const paymentId = (await pay.json()).id;
  await post(`/api/invoices/${inv.id}/payments`, staffSession, {
    type: "reverse",
    paymentId,
  });
  await post(`/api/invoices/${inv.id}`, staffSession, { action: "log_print" });
  await sql`select * from void_invoice(${inv.id}, 'Client changed the order')`; // owner path

  /* ═══ T — the timeline renders the whole story, in order ═══════════════ */
  console.log("T — timeline");
  {
    const page = await probe(`/invoices/${inv.id}`, staffSession);
    const html = await page.text();
    ok(page.status === 200, "detail view renders");
    ok(html.includes("Created as draft"), "created event shown");
    ok(html.includes("sealed"), "issued event shown");
    ok(html.includes("Payment recorded") && html.includes("400.00"),
      "payment event with AED amount");
    ok(html.includes("Payment reversed"), "reversal event shown");
    ok(html.includes("Print requested"), "print event shown (best-effort semantics)");
    ok(html.includes("Voided") && html.includes("Client changed the order"),
      "void event with the reason");
    ok(html.includes("Time Staff"), "actor name on staff-driven events");
    ok(html.includes("system"), "system actor on owner-driven events");
    const order = ["Created as draft", "Payment recorded", "Payment reversed", "Print requested"]
      .map((s) => html.indexOf(s));
    ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])),
      "events render in chronological order");
    const eventCount = (await sql`select count(*)::int as n from invoice_events where invoice_id = ${inv.id}`)[0].n;
    ok(eventCount === 6, "six events on record (created/issued/payment/reversal/print/void)");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
