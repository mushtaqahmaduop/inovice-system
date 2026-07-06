// Task 5.1 acceptance tests — record payment + reversal flow (DEMO MILESTONE).
// Run: pnpm build && pnpm test:db:5.1   (spawns `next start` on :3121)
//
// Done-criterion: unpaid → partial → paid transitions PURELY from the
// payments sum (no status column anywhere); reversals are negative
// insert-only rows paired via reverses_payment_id; the ledger is
// append-only at the DB layer for every path. DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3121";
const PASSWORD = "Pay-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));
async function rejects(promise, pattern, label) {
  try {
    await promise;
    failed++;
    console.error(`  ✗ ${label} — expected rejection, got success`);
  } catch (e) {
    ok(pattern.test(String(e.message ?? e)), `${label} (got: ${String(e.message).slice(0, 70)})`);
  }
}

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
console.log("setup — sealed invoice, users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Pay Test Co', true, 500, 'INV-{NN}')`;
const [cust] =
  await sql`insert into customers (type, name) values ('regular', 'Pay Client') returning id`;
let [method] = await sql`select id from payment_methods where is_active limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

// grand total: service 100000 + 5% VAT 5000 = 105000 fils
const [draftShell] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${draftShell.id}, 1, 'Service', 1, 0, 100000)`;
const [sealed] = await sql`select * from issue_invoice(${draftShell.id})`;

const [voidedShell] =
  await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${voidedShell.id}, 1, 'Voided svc', 1, 0, 1000)`;
await sql`select * from issue_invoice(${voidedShell.id})`;
await sql`update invoices set status='voided', voided_at=now(), void_reason='t' where id = ${voidedShell.id}`;

const [openDraft] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;

const staffId = await ensureUser("pay-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Pay Staff', 'staff', true)`;
const staffSession = await signIn("pay-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3121"], {
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

const payUrl = (id) => `/api/invoices/${id}/payments`;
const record = (amount) => ({
  type: "record",
  amount,
  methodId: method.id,
  receivedOn: "2026-07-05",
  reference: "test",
});
const listStatus = async () => {
  const [r] =
    await sql`select payment_status, paid_total from invoice_list where id = ${sealed.id}`;
  return r;
};

try {
  /* ═══ P1 — gating ══════════════════════════════════════════════════════ */
  console.log("P1 — gating");
  {
    ok((await post(payUrl(sealed.id), null, record(1000))).status === 401, "anon → 401");
    ok(
      (await post(payUrl(openDraft.id), staffSession, record(1000))).status === 409,
      "payment on a DRAFT → 409"
    );
    ok(
      (await post(payUrl(voidedShell.id), staffSession, record(1000))).status === 409,
      "payment on a VOIDED invoice → 409"
    );
    ok(
      (await post(payUrl("00000000-0000-4000-8000-000000000000"), staffSession, record(1000)))
        .status === 404,
      "unknown invoice → 404"
    );
  }

  /* ═══ P2 — validation ══════════════════════════════════════════════════ */
  console.log("P2 — validation");
  {
    ok((await post(payUrl(sealed.id), staffSession, record(0))).status === 400, "zero → 400");
    ok(
      (await post(payUrl(sealed.id), staffSession, record(-500))).status === 400,
      "negative via 'record' → 400 (reversals are the only negative path)"
    );
    ok(
      (await post(payUrl(sealed.id), staffSession, record(10.5))).status === 400,
      "fractional fils → 400"
    );
    ok(
      (
        await post(payUrl(sealed.id), staffSession, {
          ...record(1000),
          methodId: "00000000-0000-4000-8000-000000000000",
        })
      ).status === 400,
      "unknown payment method → 400 (FK)"
    );
  }

  /* ═══ P3 — DONE-CRITERION: status purely from the sum ══════════════════ */
  console.log("P3 — unpaid → partial → paid from SUM(payments)");
  let firstPaymentId;
  {
    ok((await listStatus()).payment_status === "unpaid", "starts unpaid");
    const r1 = await post(payUrl(sealed.id), staffSession, record(40000));
    firstPaymentId = (await r1.json()).id;
    ok(r1.status === 201, "staff records 400.00 AED → 201");
    ok((await listStatus()).payment_status === "partial", "40k / 105k → partial");
    const r2 = await post(payUrl(sealed.id), staffSession, record(65000));
    ok(r2.status === 201, "staff records 650.00 AED → 201");
    const s = await listStatus();
    ok(s.payment_status === "paid" && Number(s.paid_total) === 105000, "sum = grand → paid");
    const [row] = await sql`select recorded_by from payments where id = ${firstPaymentId}`;
    ok(row.recorded_by === staffId, "recorded_by from the session");
    const events = await sql`select event_type from invoice_events
      where invoice_id = ${sealed.id} and event_type = 'payment_recorded'`;
    ok(events.length === 2, "two 'payment_recorded' events");
  }

  /* ═══ P4 — reversal flow ═══════════════════════════════════════════════ */
  console.log("P4 — reversals");
  {
    const res = await post(payUrl(sealed.id), staffSession, {
      type: "reverse",
      paymentId: firstPaymentId,
    });
    const reversalId = (await res.json()).id;
    ok(res.status === 201 && !!reversalId, "reversal → 201");
    const [rev] =
      await sql`select amount, reverses_payment_id from payments where id = ${reversalId}`;
    ok(
      Number(rev.amount) === -40000 && rev.reverses_payment_id === firstPaymentId,
      "negative row PAIRED with the original"
    );
    ok(
      (await listStatus()).payment_status === "partial",
      "status drops back to partial — purely from the new sum"
    );
    ok(
      (await post(payUrl(sealed.id), staffSession, { type: "reverse", paymentId: firstPaymentId }))
        .status === 409,
      "reversing the same payment twice → 409"
    );
    ok(
      (await post(payUrl(sealed.id), staffSession, { type: "reverse", paymentId: reversalId }))
        .status === 400,
      "reversing a reversal → 400"
    );
    const events = await sql`select 1 from invoice_events
      where invoice_id = ${sealed.id} and event_type = 'payment_reversed'`;
    ok(events.length === 1, "'payment_reversed' event appended");
  }

  /* ═══ P5 — append-only at the DB layer (every path) ════════════════════ */
  console.log("P5 — ledger immutability");
  {
    await rejects(
      sql`update payments set amount = 1 where id = ${firstPaymentId}`,
      /append-only|never permitted/i,
      "direct SQL UPDATE on a payment raises"
    );
    await rejects(
      sql`delete from payments where id = ${firstPaymentId}`,
      /append-only|never permitted/i,
      "direct SQL DELETE on a payment raises"
    );
  }

  /* ═══ P6 — the panel renders ═══════════════════════════════════════════ */
  console.log("P6 — sealed view panel");
  {
    const page = await probe(`/invoices/${sealed.id}`, staffSession);
    const html = await page.text();
    ok(page.status === 200 && html.includes("Record payment"), "payments panel renders");
    ok(html.includes("reversal"), "reversal row visible in the ledger");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
