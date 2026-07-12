// Foreign-currency (D-27) acceptance tests — the AED-anchored display layer.
// Run: pnpm build && pnpm test:db:currency   (spawns `next start` on :3119)
//
// Done-criteria: currency + rate persist on a draft and are editable while
// draft; the SEALED AED math is byte-identical whether the invoice is AED or
// USD (the rate touches display only, never the seal); currency + rate freeze
// after issue (immutability); a foreign invoice cannot be sealed without a
// positive rate; the CHECK rejects a non-positive rate. DESTRUCTIVE on staging;
// guarded to the ref.

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
const PASSWORD = "Curr-Test-Only-2026!";
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
    headers: { ...(session ? { cookie: cookieFor(session) } : {}), ...(init.headers ?? {}) },
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
          values ('Currency Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name, trn, phone, address)
  values ('regular', 'FX Client LLC', '100000000000009', '+971-50-9', 'Bur Dubai') returning id`;

const staffId = await ensureUser("curr-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Curr Staff', 'staff', true)`;
const staffSession = await signIn("curr-staff@staging.test");

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

// Same fixture lines every time — the seal math must not depend on currency.
const FIXTURE_LINES = [
  { description: "Attestation", qty: 2, govtFee: 20000, serviceFee: 10000, extraFees: {} },
  { description: "Typing", qty: 1, govtFee: 0, serviceFee: 110, extraFees: {} },
];
async function createDraft({ displayCurrency = "AED", exchangeRateE6 = null } = {}) {
  const res = await post("/api/invoices", staffSession, {
    customerId: cust.id,
    issueDate: null,
    notes: null,
    terms: null,
    columns: [],
    lines: FIXTURE_LINES,
    displayCurrency,
    exchangeRateE6,
  });
  return (await res.json()).id;
}

const USD_RATE_E6 = 3_672_500; // 1 USD = 3.6725 AED

try {
  /* ═══ C1 — currency + rate persist on a draft ═════════════════════════ */
  console.log("C1 — draft persistence");
  const usdId = await createDraft({ displayCurrency: "USD", exchangeRateE6: USD_RATE_E6 });
  {
    const [d] = await sql`select display_currency, exchange_rate_e6, status
      from invoices where id = ${usdId}`;
    ok(d.status === "draft", "foreign draft created");
    ok(d.display_currency === "USD", "display_currency persisted (USD)");
    eq(d.exchange_rate_e6, USD_RATE_E6, "exchange_rate_e6 persisted");
  }

  /* ═══ C2 — currency/rate are editable WHILE DRAFT ═════════════════════ */
  console.log("C2 — draft-editable (transition matrix widened)");
  {
    // Via the API update_draft.
    const res = await post(`/api/invoices/${usdId}`, staffSession, {
      action: "update_draft",
      data: {
        customerId: cust.id,
        columns: [],
        lines: FIXTURE_LINES,
        displayCurrency: "EUR",
        exchangeRateE6: 4_000_000,
      },
    });
    ok(res.status === 200, "update_draft can change currency/rate → 200");
    // Direct SQL edit of the new columns on a DRAFT must be allowed by the trigger.
    await sql`update invoices set display_currency='USD', exchange_rate_e6=${USD_RATE_E6}
      where id = ${usdId}`;
    const [d] =
      await sql`select display_currency, exchange_rate_e6 from invoices where id = ${usdId}`;
    ok(d.display_currency === "USD", "direct draft UPDATE of display_currency allowed");
    eq(d.exchange_rate_e6, USD_RATE_E6, "direct draft UPDATE of exchange_rate_e6 allowed");
  }

  /* ═══ C3 — the seal math is IDENTICAL for AED vs USD ══════════════════ */
  console.log("C3 — sealed AED math is currency-independent");
  let sealedUsd;
  {
    const aedId = await createDraft(); // AED default
    const rUsd = await post(`/api/invoices/${usdId}`, staffSession, { action: "issue" });
    const rAed = await post(`/api/invoices/${aedId}`, staffSession, { action: "issue" });
    ok(rUsd.status === 200 && rAed.status === 200, "both invoices issue → 200");
    const [u] = await sql`select * from invoices where id = ${usdId}`;
    const [a] = await sql`select * from invoices where id = ${aedId}`;
    sealedUsd = u;
    // Oracle (registered, 5%): govt 40000; service 20110; VAT 1000 + 6 = 1006; grand 61116.
    eq(u.subtotal_govt, 40000, "USD sealed subtotal_govt (AED fils)");
    eq(u.subtotal_service, 20110, "USD sealed subtotal_service (AED fils)");
    eq(u.vat_amount, 1006, "USD sealed VAT (AED fils, per-component half-up)");
    eq(u.grand_total, 61116, "USD sealed grand_total (AED fils)");
    ok(
      Number(u.subtotal_govt) === Number(a.subtotal_govt) &&
        Number(u.subtotal_service) === Number(a.subtotal_service) &&
        Number(u.subtotal_extras) === Number(a.subtotal_extras) &&
        Number(u.vat_amount) === Number(a.vat_amount) &&
        Number(u.grand_total) === Number(a.grand_total),
      "USD and AED invoices seal to BYTE-IDENTICAL AED totals (rate touches display only)"
    );
    ok(
      u.display_currency === "USD" && a.display_currency === "AED",
      "currencies preserved at issue"
    );
    eq(a.exchange_rate_e6, null, "AED invoice carries no rate");
    eq(u.exchange_rate_e6, USD_RATE_E6, "USD invoice's rate frozen at issue");
  }

  /* ═══ C4 — display oracle: foreign = round(AED × 1e6 / rate) ══════════ */
  console.log("C4 — display derivation oracle");
  {
    // grand_total 61116 fils (AED 611.16) ÷ 3.6725 = USD 166.42 → 16642 cents.
    const foreignMinor = Math.round((Number(sealedUsd.grand_total) * 1_000_000) / USD_RATE_E6);
    eq(foreignMinor, 16642, "AED 611.16 → USD 166.42 (display-only derivation)");
  }

  /* ═══ C5 — currency + rate FREEZE after issue (immutability) ══════════ */
  console.log("C5 — frozen after issue");
  {
    await rejects(
      sql`update invoices set display_currency='EUR' where id = ${usdId}`,
      /not allowed|may not change/i,
      "direct UPDATE of display_currency on sealed raises"
    );
    await rejects(
      sql`update invoices set exchange_rate_e6=1 where id = ${usdId}`,
      /not allowed|may not change/i,
      "direct UPDATE of exchange_rate_e6 on sealed raises"
    );
  }

  /* ═══ C6 — a foreign invoice cannot seal without a positive rate ══════ */
  console.log("C6 — issue guard");
  {
    const noRate = await createDraft({ displayCurrency: "USD", exchangeRateE6: null });
    const res = await post(`/api/invoices/${noRate}`, staffSession, { action: "issue" });
    ok(res.status === 422, "foreign draft with no rate → 422 (blocked before seal)");
    const [d] = await sql`select status from invoices where id = ${noRate}`;
    ok(d.status === "draft", "the blocked draft stays a draft (not sealed)");
  }

  /* ═══ C7 — CHECK rejects a non-positive rate ══════════════════════════ */
  console.log("C7 — rate CHECK constraint");
  {
    await rejects(
      sql`insert into invoices (customer_id, display_currency, exchange_rate_e6)
          values (${cust.id}, 'USD', 0)`,
      /invoices_exchange_rate_positive|violates check/i,
      "exchange_rate_e6 = 0 rejected by CHECK"
    );
    await rejects(
      sql`insert into invoices (customer_id, display_currency, exchange_rate_e6)
          values (${cust.id}, 'USD', -5)`,
      /invoices_exchange_rate_positive|violates check/i,
      "negative exchange_rate_e6 rejected by CHECK"
    );
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
