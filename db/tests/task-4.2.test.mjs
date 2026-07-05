// Task 4.2 acceptance tests — the issue flow (FABLE task).
// Run: pnpm build && pnpm test:db:4.2   (spawns `next start` on :3118)
//
// Done-criteria: issued invoice is visibly AND actually immutable; the
// number appears only after issue; already-issued double-submits are
// SUCCESS (R-6); error paths answer with real statuses; sealing uses
// issue-time settings (mid-draft changes land in the seal, not after it).
// DESTRUCTIVE on staging; guarded to the ref.

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
const APP = "http://127.0.0.1:3118";
const PASSWORD = "Issu-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));
const eq = (a, b, l) => ok(Number(a) === Number(b), `${l} (expected ${b}, got ${a})`);
async function rejects(promise, pattern, label) {
  try {
    await promise;
    failed++;
    console.error(`  ✗ ${label} — expected rejection, got success`);
  } catch (e) {
    ok(pattern.test(String(e.message ?? e)), `${label} (got: ${String(e.message).slice(0, 80)})`);
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
console.log("setup — clean tables, users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Issue Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name, trn, phone, address)
  values ('regular', 'Seal Client LLC', '100000000000003', '+971-50-1', 'Deira') returning id`;

const staffId = await ensureUser("issu-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Issu Staff', 'staff', true)`;
const staffSession = await signIn("issu-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3118"], {
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

async function createDraft() {
  const res = await post("/api/invoices", staffSession, {
    customerId: cust.id,
    issueDate: null,
    notes: "Sealed notes",
    terms: null,
    columns: [{ label: "Courier", vatable: true }],
    lines: [
      { description: "Attestation", qty: 2, govtFee: 20000, serviceFee: 10000, extraFees: { 0: 500 } },
      { description: "Typing", qty: 1, govtFee: 0, serviceFee: 110, extraFees: {} },
    ],
  });
  return (await res.json()).id;
}

try {
  /* ═══ I1 — the sealing moment ══════════════════════════════════════════ */
  console.log("I1 — issue via the API");
  let sealedId;
  {
    sealedId = await createDraft();
    ok((await post(`/api/invoices/${sealedId}`, null, { action: "issue" })).status === 401, "anon → 401");
    const res = await post(`/api/invoices/${sealedId}`, staffSession, { action: "issue" });
    const body = await res.json();
    ok(res.status === 200 && body.invoiceNumber === "INV-1", "issue → 200, number INV-1 allocated AT issue");
    const [inv] = await sql`select * from invoices where id = ${sealedId}`;
    ok(inv.status === "issued" && inv.issued_by === staffId, "status issued; issued_by from session");
    // Oracle: govt 2×20000=40000; service 2×10000+110=20110; extras 2×500=1000
    // VAT: (2×10000)@5%=1000 + 110@5%=5.5→6 + (2×500)@5%=50 → 1056
    eq(inv.subtotal_govt, 40000, "sealed subtotal_govt");
    eq(inv.subtotal_service, 20110, "sealed subtotal_service");
    eq(inv.subtotal_extras, 1000, "sealed subtotal_extras");
    eq(inv.vat_amount, 1056, "sealed VAT (per-component half-up)");
    eq(inv.grand_total, 62166, "sealed grand total");
    ok(inv.customer_snapshot?.name === "Seal Client LLC", "customer snapshot frozen");
    ok(inv.vat_registered_snapshot === true && inv.vat_rate_bp_snapshot === 500, "VAT snapshots frozen");
    const lines = await sql`select vat_amount from invoice_lines where invoice_id = ${sealedId} order by position`;
    eq(lines[0].vat_amount, 1000, "per-line VAT frozen (line 1)");
    eq(lines[1].vat_amount, 6, "per-line VAT frozen (line 2, 5.5→6)");
    const events = await sql`select event_type from invoice_events where invoice_id = ${sealedId} order by created_at`;
    ok(events.map((e) => e.event_type).join(",") === "created,issued", "'issued' event appended");
  }

  /* ═══ I2 — R-6: double submit is success ═══════════════════════════════ */
  console.log("I2 — double submit (R-6)");
  {
    const res = await post(`/api/invoices/${sealedId}`, staffSession, { action: "issue" });
    const body = await res.json();
    ok(res.status === 200 && body.alreadyIssued === true && body.invoiceNumber === "INV-1",
      "second issue → 200 alreadyIssued (rendered as success, not error)");
  }

  /* ═══ I3 — error paths ═════════════════════════════════════════════════ */
  console.log("I3 — error paths");
  {
    const [empty] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
    ok(
      (await post(`/api/invoices/${empty.id}`, staffSession, { action: "issue" })).status === 422,
      "empty invoice (no lines) → 422"
    );
    // Void a dedicated invoice (issued→voided is the one legal sealed
    // transition; voided→issued would itself be rejected by the matrix).
    const voidedId = await createDraft();
    await post(`/api/invoices/${voidedId}`, staffSession, { action: "issue" }); // INV-2
    await sql`update invoices set status='voided', voided_at=now(), void_reason='test'
      where id = ${voidedId}`;
    const votest = await post(`/api/invoices/${voidedId}`, staffSession, { action: "issue" });
    ok(votest.status === 409, "voided invoice → 409 (not silently reissued)");
    ok(
      (await post(`/api/invoices/00000000-0000-4000-8000-000000000000`, staffSession, { action: "issue" }))
        .status === 404,
      "unknown id → 404"
    );
  }

  /* ═══ I4 — sealed = actually immutable, every path ═════════════════════ */
  console.log("I4 — immutability");
  {
    ok(
      (await post(`/api/invoices/${sealedId}`, staffSession, {
        action: "update_draft",
        data: {
          customerId: cust.id,
          columns: [],
          lines: [{ description: "x", qty: 1, govtFee: 0, serviceFee: 1, extraFees: {} }],
        },
      })).status === 409,
      "update_draft on sealed → 409 (app layer)"
    );
    await rejects(
      sql`update invoices set notes = 'tamper' where id = ${sealedId}`,
      /not allowed|may not change/i,
      "direct SQL UPDATE on sealed raises (DB layer binds every path)"
    );
    await rejects(
      sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
          values (${sealedId}, 99, 'smuggled', 1, 0, 1)`,
      /frozen|non-draft/i,
      "child insert under sealed parent raises (parent-lock)"
    );
  }

  /* ═══ I5 — sealed view + print logging ═════════════════════════════════ */
  console.log("I5 — sealed view + print");
  {
    const page = await probe(`/invoices/${sealedId}`, staffSession);
    const html = await page.text();
    ok(page.status === 200 && html.includes("INV-1"), "sealed view renders the number");
    ok(/[Ss]ealed/.test(html), "sealed view shows the sealed indicator");
    ok(html.includes("Tax Invoice"), "registered snapshot → 'Tax Invoice' title");

    const draftId2 = await createDraft();
    const draftView = await probe(`/invoices/${draftId2}`, staffSession);
    // With the (shell) loading.tsx boundary, server redirects stream inside
    // a 200 instead of arriving as HTTP 3xx — accept either form.
    const dvBody = await draftView.text();
    ok(
      ([301, 302, 303, 307, 308].includes(draftView.status) &&
        (draftView.headers.get("location") ?? "").includes(`/invoices/${draftId2}/edit`)) ||
        dvBody.includes(`/invoices/${draftId2}/edit`),
      "draft detail routes to the editor (HTTP or streamed redirect)"
    );
    ok(
      (await post(`/api/invoices/${draftId2}`, staffSession, { action: "log_print" })).status === 409,
      "log_print on a draft → 409"
    );
    ok(
      (await post(`/api/invoices/${sealedId}`, staffSession, { action: "log_print" })).status === 200,
      "log_print on sealed → 200"
    );
    const [printed] = await sql`select count(*)::int as n from invoice_events
      where invoice_id = ${sealedId} and event_type = 'printed'`;
    ok(printed.n === 1, "'printed' event recorded (best-effort by design)");
  }

  /* ═══ I6 — settings changed mid-draft → seal uses ISSUE-time settings ══ */
  console.log("I6 — issue-time settings");
  {
    const draftId3 = await createDraft();
    await sql`update settings set vat_registered = false`;
    const res = await post(`/api/invoices/${draftId3}`, staffSession, { action: "issue" });
    ok(res.status === 200, "issue succeeds after a mid-draft settings change");
    const [inv] = await sql`select vat_registered_snapshot, vat_amount, invoice_number
      from invoices where id = ${draftId3}`;
    ok(
      inv.vat_registered_snapshot === false && Number(inv.vat_amount) === 0,
      "sealed with ISSUE-time settings (deregistered → 0 VAT)"
    );
    ok(inv.invoice_number === "INV-3", "gapless numbering continues (INV-3 after INV-2 was voided, number kept)");
    const [first] = await sql`select vat_amount from invoices where id = ${sealedId}`;
    eq(first.vat_amount, 1056, "earlier sealed invoice untouched by the settings change");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
