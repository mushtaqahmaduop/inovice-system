// Task 4.4 acceptance tests — void + replacement flow.
// Run: pnpm build && pnpm test:db:4.4   (spawns `next start` on :3120)
//
// Done-criteria: a voided invoice keeps its number and financials frozen;
// the replacement links back via replaces_invoice_id. Voiding is ADMIN
// aal2 at the API and admin at the DB function — a staff PostgREST RPC
// call fails inside Postgres, not just at the route. DESTRUCTIVE.

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
const APP = "http://127.0.0.1:3120";
const PASSWORD = "Void-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));
const eq = (a, b, l) => ok(Number(a) === Number(b), `${l} (expected ${b}, got ${a})`);

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

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — sealed fixtures, users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Void Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name) values ('regular', 'Void Client') returning id`;

async function mkSealed() {
  const [inv] = await sql`insert into invoices (customer_id, notes) values (${cust.id}, 'copy me') returning id`;
  const [line] = await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Attestation', 2, 20000, 10000) returning id`;
  const [col] = await sql`insert into invoice_extra_columns (invoice_id, label, vatable, position)
    values (${inv.id}, 'Courier', true, 1) returning id`;
  await sql`insert into invoice_line_fees (line_id, column_id, amount) values (${line.id}, ${col.id}, 500)`;
  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;
  return sealed;
}
const first = await mkSealed(); // INV-1 — void without replacement
const second = await mkSealed(); // INV-2 — void WITH replacement

const adminId = await ensureUser("void-admin@staging.test");
const staffId = await ensureUser("void-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Void Admin', 'admin', true),
  (${staffId}, 'Void Staff', 'staff', true)`;
const adminSession = await toAal2("void-admin@staging.test");
const staffSession = await signIn("void-staff@staging.test");
const aal1AdminSession = await signIn("void-admin@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3120"], {
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
  /* ═══ W1 — admin-only, at BOTH layers ══════════════════════════════════ */
  console.log("W1 — authorization");
  {
    const body = { action: "void", reason: "nope", createReplacement: false };
    ok((await post(`/api/invoices/${first.id}`, null, body)).status === 401, "anon → 401");
    ok((await post(`/api/invoices/${first.id}`, staffSession, body)).status === 403, "staff → 403");
    ok(
      (await post(`/api/invoices/${first.id}`, aal1AdminSession, body)).status === 403,
      "aal1 admin → 403"
    );
    // DB-layer: staff calling the function DIRECTLY over PostgREST RPC.
    const rpc = await fetch(`${SUPA_URL}/rest/v1/rpc/void_invoice`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${staffSession.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_invoice_id: first.id, p_reason: "smuggled" }),
    });
    const rpcBody = await rpc.text();
    ok(
      !rpc.ok && /only admins/.test(rpcBody),
      "staff direct PostgREST RPC rejected INSIDE Postgres"
    );
    const [still] = await sql`select status from invoices where id = ${first.id}`;
    ok(still.status === "issued", "invoice untouched by all rejected attempts");
  }

  /* ═══ W2 — the void itself ═════════════════════════════════════════════ */
  console.log("W2 — void (no replacement)");
  {
    ok(
      (await post(`/api/invoices/${first.id}`, adminSession, { action: "void", reason: "  " }))
        .status === 400,
      "blank reason → 400"
    );
    const res = await post(`/api/invoices/${first.id}`, adminSession, {
      action: "void",
      reason: "Wrong customer on the document",
      createReplacement: false,
    });
    ok(res.status === 200, "admin voids → 200");
    const [inv] = await sql`select * from invoices where id = ${first.id}`;
    ok(inv.status === "voided" && inv.void_reason === "Wrong customer on the document",
      "status voided, reason stored");
    ok(inv.voided_by === adminId, "voided_by from the session");
    ok(inv.invoice_number === "INV-1", "NUMBER KEPT (done-criterion)");
    eq(inv.grand_total, first.grand_total, "FINANCIALS FROZEN (done-criterion)");
    const events = await sql`select event_type, payload from invoice_events
      where invoice_id = ${first.id} order by created_at`;
    ok(
      events.at(-1).event_type === "voided" &&
        events.at(-1).payload.reason === "Wrong customer on the document",
      "'voided' event with reason payload"
    );
    ok(
      (await post(`/api/invoices/${first.id}`, adminSession, { action: "void", reason: "again" }))
        .status === 409,
      "voiding twice → 409"
    );
    const [draft] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
    ok(
      (await post(`/api/invoices/${draft.id}`, adminSession, { action: "void", reason: "x" }))
        .status === 422,
      "voiding a draft → 422 (drafts are edited)"
    );
  }

  /* ═══ W3 — replacement draft links back ════════════════════════════════ */
  console.log("W3 — replacement");
  let replacementId;
  {
    const res = await post(`/api/invoices/${second.id}`, adminSession, {
      action: "void",
      reason: "Amount correction",
      createReplacement: true,
    });
    const body = await res.json();
    replacementId = body.replacementId;
    ok(res.status === 200 && !!replacementId, "void with replacement → replacementId");
    const [rep] = await sql`select * from invoices where id = ${replacementId}`;
    ok(rep.status === "draft" && rep.invoice_number === null, "replacement is an unnumbered draft");
    ok(rep.replaces_invoice_id === second.id, "replaces_invoice_id LINKS BACK (done-criterion)");
    ok(rep.notes === "copy me", "notes copied");
    const lines = await sql`select description, qty, govt_fee, service_fee from invoice_lines
      where invoice_id = ${replacementId}`;
    ok(lines.length === 1 && Number(lines[0].govt_fee) === 20000 && lines[0].qty === 2,
      "lines copied verbatim");
    const fees = await sql`select f.amount, c.label from invoice_line_fees f
      join invoice_extra_columns c on c.id = f.column_id
      join invoice_lines l on l.id = f.line_id where l.invoice_id = ${replacementId}`;
    ok(fees.length === 1 && Number(fees[0].amount) === 500 && fees[0].label === "Courier",
      "extra columns + junction fees copied");
    const [ev] = await sql`select payload from invoice_events
      where invoice_id = ${replacementId} and event_type = 'created'`;
    ok(ev?.payload?.replaces === "INV-2", "'created' event names the replaced number");
  }

  /* ═══ W4 — lineage visible on the pages ════════════════════════════════ */
  console.log("W4 — pages");
  {
    const voidedPage = await probe(`/invoices/${second.id}`, adminSession);
    const html = await voidedPage.text();
    ok(voidedPage.status === 200 && /[Vv]oided/.test(html), "voided view shows the banner");
    ok(html.includes("replaced by"), "voided view links to the replacement");
    ok((await probe(`/invoices/${replacementId}/edit`, staffSession)).status === 200,
      "replacement draft opens in the editor");
    const staffVoidedView = await probe(`/invoices/${second.id}`, staffSession);
    const staffHtml = await staffVoidedView.text();
    ok(!staffHtml.includes("Void…"), "staff never sees the Void control");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
