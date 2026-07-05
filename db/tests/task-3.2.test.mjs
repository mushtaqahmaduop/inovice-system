// Task 3.2 acceptance tests — settings page + payment methods (D-25).
// Run: pnpm build && pnpm test:db:3.2   (spawns `next start` on :3115)
//
// Done-criterion (BUILD_PHASES 3.2): the VAT toggle demonstrably affects a
// NEW draft's calculation and NOT any issued invoice — proven end-to-end
// here: issue at 5%, toggle off through the real API, issue again at 0%,
// and re-read the first invoice's sealed totals unchanged (D-16).
// DESTRUCTIVE on staging; guarded to the ref.

import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
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
const APP = "http://127.0.0.1:3115";
const PASSWORD = "Sett-Test-Only-2026!";
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
function base32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0;
  const out = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String(
    (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000
  ).padStart(6, "0");
}
async function toAal2(email) {
  const aal1 = await signIn(email);
  const factor = await gotrue(
    "POST",
    "/factors",
    { factor_type: "totp", friendly_name: "test" },
    aal1.access_token
  );
  const challenge = await gotrue("POST", `/factors/${factor.id}/challenge`, {}, aal1.access_token);
  return gotrue(
    "POST",
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(factor.totp.secret) },
    aal1.access_token
  );
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

const BASE_SETTINGS = {
  companyName: "Settings Test Co",
  companyNameAr: "",
  tagline: "typing · government services",
  trn: "100000000000003",
  address: "Deira, Dubai",
  phone: "+971-4-0000000",
  email: "office@settings.test",
  bankDetails: "IBAN AE00 0000 0000 0000 0000 000",
  vatRegistered: true,
  vatRateBp: 500,
  invoiceNumberFormat: "INV-{NN}",
  paperSize: "A4",
  invoiceNotesDefault: "Thank you.",
  invoiceTermsDefault: "Due on receipt.",
  dueDaysDefault: 14,
};

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — users, clean tables, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Staging Test Co', true, 500, 'INV-{NN}')`;
// Idempotency: this suite's method rows survive runs (payments were just
// truncated, so no FK holds them).
await sql`delete from payment_methods where label in ('Payment Link', 'Pay Link')`;

const adminId = await ensureUser("sett-admin@staging.test");
const staffId = await ensureUser("sett-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Sett Admin', 'admin', true),
  (${staffId}, 'Sett Staff', 'staff', true)`;
const adminSession = await toAal2("sett-admin@staging.test");
const staffSession = await signIn("sett-staff@staging.test");
const aal1AdminSession = await signIn("sett-admin@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3115"], {
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

async function mkIssuable() {
  const [c] = await sql`insert into customers (type, name) values ('walk_in', 'VAT Probe') returning id`;
  const [inv] = await sql`insert into invoices (customer_id) values (${c.id}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Typing service', 1, 20000, 10000)`;
  return inv.id;
}

try {
  /* ═══ T1 — settings API authorization ══════════════════════════════════ */
  console.log("T1 — authorization");
  {
    ok((await post("/api/admin/settings", null, BASE_SETTINGS)).status === 401, "anon → 401");
    ok((await post("/api/admin/settings", staffSession, BASE_SETTINGS)).status === 403, "staff → 403");
    ok(
      (await post("/api/admin/settings", aal1AdminSession, BASE_SETTINGS)).status === 403,
      "aal1 admin → 403"
    );
  }

  /* ═══ T2 — validation ══════════════════════════════════════════════════ */
  console.log("T2 — validation");
  {
    ok(
      (await post("/api/admin/settings", adminSession, { ...BASE_SETTINGS, companyName: "" }))
        .status === 400,
      "empty company name → 400"
    );
    ok(
      (await post("/api/admin/settings", adminSession, { ...BASE_SETTINGS, invoiceNumberFormat: "INV-" }))
        .status === 400,
      "number format without {NN} → 400 (D-12)"
    );
    ok(
      (await post("/api/admin/settings", adminSession, { ...BASE_SETTINGS, vatRateBp: 20000 }))
        .status === 400,
      "vat rate > 100% → 400"
    );
    ok(
      (await post("/api/admin/settings", adminSession, { ...BASE_SETTINGS, paperSize: "thermal" }))
        .status === 400,
      "thermal paper rejected (Q-07: the shop prints A4/A5 only)"
    );
    ok(
      (await post("/api/admin/settings", adminSession, { ...BASE_SETTINGS, paperSize: "A5" }))
        .status === 200,
      "A5 accepted (Q-07 answered 2026-07-05)"
    );
  }

  /* ═══ T3 — update lands, audit fields from the session ═════════════════ */
  console.log("T3 — update");
  {
    const res = await post("/api/admin/settings", adminSession, BASE_SETTINGS);
    ok(res.status === 200, "admin saves settings");
    const [row] = await sql`select * from settings limit 1`;
    ok(row.company_name === "Settings Test Co", "company name updated");
    ok(row.tagline === BASE_SETTINGS.tagline && row.bank_details === BASE_SETTINGS.bankDetails,
      "tagline + bank details stored [#11]");
    ok(row.updated_by === adminId, "updated_by = session admin (never client-supplied)");
    ok(row.due_days_default === 14, "due days stored");
  }

  /* ═══ T4 — DONE-CRITERION: VAT toggle → future invoices only (D-16) ════ */
  console.log("T4 — VAT toggle acceptance");
  {
    const firstId = await mkIssuable();
    const [first] = await sql`select * from issue_invoice(${firstId})`;
    ok(Number(first.vat_amount) === 500, "registered: 5% VAT on service fee (500 fils)");
    ok(first.vat_registered_snapshot === true && first.vat_rate_bp_snapshot === 500,
      "VAT state + rate sealed into the invoice");

    const res = await post("/api/admin/settings", adminSession, {
      ...BASE_SETTINGS,
      vatRegistered: false,
    });
    ok(res.status === 200, "admin deregisters VAT through the real API");

    const secondId = await mkIssuable();
    const [second] = await sql`select * from issue_invoice(${secondId})`;
    ok(Number(second.vat_amount) === 0, "deregistered: NEW invoice gets 0 VAT");
    ok(second.vat_registered_snapshot === false, "new invoice sealed as unregistered");

    const [firstAgain] = await sql`select vat_amount, grand_total, vat_registered_snapshot,
      vat_rate_bp_snapshot from invoices where id = ${first.id}`;
    ok(
      Number(firstAgain.vat_amount) === 500 &&
        Number(firstAgain.grand_total) === Number(first.grand_total) &&
        firstAgain.vat_registered_snapshot === true &&
        firstAgain.vat_rate_bp_snapshot === 500,
      "issued invoice UNCHANGED by the toggle — snapshots hold"
    );
    ok(row_trn_kept(await sql`select trn from settings limit 1`), "TRN kept during deregistration (F-4b)");
  }

  /* ═══ T5 — payment methods (D-25) ══════════════════════════════════════ */
  console.log("T5 — payment methods");
  let methodId;
  {
    ok(
      (await post("/api/admin/payment-methods", staffSession, { label: "Crypto" })).status === 403,
      "staff cannot add methods"
    );
    const res = await post("/api/admin/payment-methods", adminSession, {
      label: "Payment Link",
      position: 9,
    });
    methodId = (await res.json()).id;
    ok(res.status === 201 && !!methodId, "admin adds a method → 201");
    ok(
      (await post("/api/admin/payment-methods", adminSession, { label: "Payment Link" })).status === 409,
      "duplicate label → 409"
    );
    ok(
      (await post(`/api/admin/payment-methods/${methodId}`, adminSession, { label: "Pay Link" }))
        .status === 200,
      "rename → 200"
    );
    ok(
      (await post(`/api/admin/payment-methods/${methodId}`, adminSession, { isActive: false, position: 3 }))
        .status === 200,
      "deactivate + reposition → 200"
    );
    const [m] = await sql`select label, is_active, position from payment_methods where id = ${methodId}`;
    ok(m.label === "Pay Link" && m.is_active === false && m.position === 3, "all edits landed");
    ok(
      (await probe(`/api/admin/payment-methods/${methodId}`, adminSession, { method: "DELETE" }))
        .status === 405,
      "no DELETE handler — methods are deactivated, never deleted"
    );
    ok(
      (await post(`/api/admin/payment-methods/${methodId}`, adminSession, {})).status === 400,
      "empty update → 400"
    );
  }

  /* ═══ T6 — page gating ═════════════════════════════════════════════════ */
  console.log("T6 — /admin/settings route");
  {
    const staffPage = await probe("/admin/settings", staffSession);
    const loc = new URL(staffPage.headers.get("location") ?? "/", APP).pathname;
    ok([301, 302, 303, 307, 308].includes(staffPage.status) && loc === "/dashboard",
      "staff → redirected to /dashboard");
    ok((await probe("/admin/settings", adminSession)).status === 200, "aal2 admin renders the page");
  }
} finally {
  server.kill();
}

function row_trn_kept(rows) {
  return rows[0]?.trn === BASE_SETTINGS.trn;
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
