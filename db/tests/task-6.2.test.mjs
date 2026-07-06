// Task 6.2 acceptance tests — CSV exports (invoices / payments / VAT basis).
// Run: pnpm build && pnpm test:db:6.2   (spawns `next start` on :3124)
//
// Proves: admin-aal2-only gating; drafts excluded, voided labeled; money as
// plain 2-decimal AED strings from integer math (no thousands separators);
// reversal rows flagged; date-range filtering. DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3124";
const PASSWORD = "Csv-Test-Only-2026!";
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
const probe = (path, session) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — export fixtures, users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Csv Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name)
  values ('regular', 'Csv, "Quoted" Client') returning id`; // exercises escaping
let [method] = await sql`select id from payment_methods where is_active limit 1`;
if (!method) [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

async function mkSealed(issueDateOffsetDays = 0) {
  const [inv] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Svc', 1, 123400, 100000)`; // grand 228400, vat 5000
  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;
  if (issueDateOffsetDays !== 0) {
    // Backdating for the range test happens via issue_date, which the
    // matrix freezes — so build the date BEFORE issue instead: not
    // possible post-seal; use payments dates for range tests instead.
  }
  return sealed;
}
const inv1 = await mkSealed(); // INV-1 sealed today
await mkSealed(); // INV-2 sealed today
const voided = await mkSealed(); // INV-3 → voided
await sql`select * from void_invoice(${voided.id}, 'export test')`;
await sql`insert into invoices (customer_id) values (${cust.id})`; // draft — must not appear

const [pay1] =
  await sql`insert into payments (invoice_id, amount, method_id, received_on, reference)
  values (${inv1.id}, 40000, ${method.id}, '2026-07-01', 'first') returning id`;
await sql`insert into payments (invoice_id, amount, method_id, received_on, reverses_payment_id, reference)
  values (${inv1.id}, -40000, ${method.id}, '2026-07-03', ${pay1.id}, 'undo')`;
await sql`insert into payments (invoice_id, amount, method_id, received_on, reference)
  values (${inv1.id}, 228400, ${method.id}, '2026-06-15', 'old month')`;

const adminId = await ensureUser("csv-admin@staging.test");
const staffId = await ensureUser("csv-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Csv Admin', 'admin', true),
  (${staffId}, 'Csv Staff', 'staff', true)`;
const adminSession = await toAal2("csv-admin@staging.test");
const staffSession = await signIn("csv-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3124"], {
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
  /* ═══ X1 — gating ══════════════════════════════════════════════════════ */
  console.log("X1 — authorization");
  {
    ok((await probe("/api/export/invoices", null)).status === 401, "anon → 401");
    ok((await probe("/api/export/invoices", staffSession)).status === 403, "staff → 403");
    ok((await probe("/api/export/nonsense", adminSession)).status === 400, "unknown kind → 400");
  }

  /* ═══ X2 — invoices.csv ════════════════════════════════════════════════ */
  console.log("X2 — invoices export");
  {
    const res = await probe("/api/export/invoices", adminSession);
    const csv = await res.text();
    ok(
      res.status === 200 && res.headers.get("content-type")?.includes("text/csv"),
      "downloads as text/csv"
    );
    ok(res.headers.get("content-disposition")?.includes("attachment"), "attachment disposition");
    const lines = csv.trim().split("\r\n");
    ok(lines.length === 4, "header + 3 sealed/voided rows (draft EXCLUDED)");
    ok(csv.includes("INV-1") && csv.includes("INV-3"), "numbers present");
    ok(csv.includes("voided"), "voided row labeled");
    ok(csv.includes("2284.00"), "grand total as plain 2-decimal AED (no thousands separator)");
    ok(csv.includes('"Csv, ""Quoted"" Client"'), "commas + quotes escaped per RFC 4180");
  }

  /* ═══ X3 — payments.csv + range filter ═════════════════════════════════ */
  console.log("X3 — payments export");
  {
    const all = await (await probe("/api/export/payments", adminSession)).text();
    ok(all.trim().split("\r\n").length === 4, "header + 3 payment rows");
    ok(all.includes("-400.00"), "reversal amount negative, integer math");
    ok(all.includes("yes"), "is_reversal flag");
    const july = await (
      await probe("/api/export/payments?from=2026-07-01&to=2026-07-31", adminSession)
    ).text();
    ok(july.trim().split("\r\n").length === 3, "date range excludes the June payment");
    ok(!july.includes("old month"), "June reference absent from the July file");
  }

  /* ═══ X4 — vat.csv ═════════════════════════════════════════════════════ */
  console.log("X4 — VAT basis export");
  {
    const csv = await (await probe("/api/export/vat", adminSession)).text();
    const lines = csv.trim().split("\r\n");
    ok(
      lines[0].includes("vat_rate_percent") && lines[0].includes("taxable_base_aed"),
      "VAT basis columns present"
    );
    ok(csv.includes(",5,") || csv.includes(",5\r"), "rate rendered as percent (5)");
    ok(csv.includes("1234.00"), "non-taxable govt passthrough split out");
    ok(csv.includes("50.00"), "sealed VAT amount");
  }

  /* ═══ X5 — the exports page ════════════════════════════════════════════ */
  console.log("X5 — /admin/exports");
  {
    const staffPage = await probe("/admin/exports", staffSession);
    ok([301, 302, 303, 307, 308].includes(staffPage.status), "staff → redirected");
    ok((await probe("/admin/exports", adminSession)).status === 200, "admin renders the page");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
