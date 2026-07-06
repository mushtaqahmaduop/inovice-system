// Task 3.1 acceptance tests — customers CRUD API + page gating.
// Run: pnpm build && pnpm test:db:3.1   (spawns `next start` on :3114)
//
// Proves: zod validation, staff create/update, walk-in quick create ([#7]
// name-only), soft delete as ADMIN-ONLY (staff 403, aal1 admin 403), restore,
// and that RLS hides deleted rows from staff updates. Hard DELETE has no
// handler at all — asserted. DESTRUCTIVE on staging; guarded to the ref.

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
const APP = "http://127.0.0.1:3114";
const PASSWORD = "Cust-Test-Only-2026!";
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

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — users, clean tables, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Staging Test Co', true, 500, 'INV-{NN}')`;

const adminId = await ensureUser("cust-admin@staging.test");
const staffId = await ensureUser("cust-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Cust Admin', 'admin', true),
  (${staffId}, 'Cust Staff', 'staff', true)`;
const adminSession = await toAal2("cust-admin@staging.test");
const staffSession = await signIn("cust-staff@staging.test");
const aal1AdminSession = await signIn("cust-admin@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3114"], {
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
  /* ═══ C1 — auth gating ═════════════════════════════════════════════════ */
  console.log("C1 — authorization");
  {
    ok(
      (await post("/api/customers", null, { type: "regular", name: "X" })).status === 401,
      "anon create → 401"
    );
    const page = await probe("/customers", null);
    ok([301, 302, 303, 307, 308].includes(page.status), "anon /customers → redirect to login");
    ok((await probe("/customers", staffSession)).status === 200, "staff renders /customers");
  }

  /* ═══ C2 — zod validation ══════════════════════════════════════════════ */
  console.log("C2 — validation");
  {
    ok(
      (await post("/api/customers", staffSession, { type: "regular" })).status === 400,
      "missing name → 400"
    );
    ok(
      (await post("/api/customers", staffSession, { type: "vip", name: "X" })).status === 400,
      "unknown type → 400"
    );
    ok(
      (await post("/api/customers", staffSession, { type: "regular", name: "X", email: "nope" }))
        .status === 400,
      "malformed email → 400"
    );
  }

  /* ═══ C3 — create: staff may, walk-in needs only a name ([#7]) ═════════ */
  console.log("C3 — create");
  let regularId, walkinId;
  {
    const reg = await post("/api/customers", staffSession, {
      type: "regular",
      name: "Crud Regular LLC",
      trn: "100000000000003",
      phone: "+971-50-1111111",
      email: "client@crud.test",
      address: "Deira, Dubai",
      notes: "",
    });
    regularId = (await reg.json()).id;
    ok(reg.status === 201 && !!regularId, "staff creates regular client → 201");
    const [regRow] = await sql`select * from customers where id = ${regularId}`;
    ok(regRow?.notes === null, "empty-string fields normalize to NULL");

    const walk = await post("/api/customers", staffSession, {
      type: "walk_in",
      name: "Crud Walkin",
    });
    walkinId = (await walk.json()).id;
    ok(walk.status === 201 && !!walkinId, "walk-in quick create with name only → 201");
    const [walkRow] = await sql`select type, phone from customers where id = ${walkinId}`;
    ok(walkRow?.type === "walk_in" && walkRow.phone === null, "walk-in row minimal as sent");
  }

  /* ═══ C4 — update ══════════════════════════════════════════════════════ */
  console.log("C4 — update");
  {
    const res = await post(`/api/customers/${regularId}`, staffSession, {
      action: "update",
      data: { phone: "+971-50-2222222" },
    });
    ok(res.status === 200, "staff updates a customer");
    const [row] = await sql`select phone from customers where id = ${regularId}`;
    ok(row?.phone === "+971-50-2222222", "update landed in the DB");
    const ghost = await post(`/api/customers/00000000-0000-4000-8000-000000000000`, staffSession, {
      action: "update",
      data: { phone: "x" },
    });
    ok(ghost.status === 404, "unknown id → 404");
    ok(
      (await post(`/api/customers/not-a-uuid`, staffSession, { action: "update", data: {} }))
        .status === 400,
      "malformed id → 400"
    );
  }

  /* ═══ C5 — soft delete is ADMIN-only; hard delete does not exist ═══════ */
  console.log("C5 — soft delete / restore");
  {
    ok(
      (await post(`/api/customers/${walkinId}`, staffSession, { action: "soft_delete" })).status ===
        403,
      "staff soft-delete → 403"
    );
    ok(
      (await post(`/api/customers/${walkinId}`, aal1AdminSession, { action: "soft_delete" }))
        .status === 403,
      "aal1 admin (no TOTP this session) soft-delete → 403"
    );
    const del = await post(`/api/customers/${walkinId}`, adminSession, { action: "soft_delete" });
    ok(del.status === 200, "aal2 admin soft-deletes");
    const [gone] = await sql`select deleted_at from customers where id = ${walkinId}`;
    ok(gone?.deleted_at !== null, "deleted_at set — row still exists (soft)");

    const editDeleted = await post(`/api/customers/${walkinId}`, staffSession, {
      action: "update",
      data: { name: "Zombie Edit" },
    });
    ok(editDeleted.status === 404, "staff cannot update a deleted row (RLS + filter)");

    const res = await post(`/api/customers/${walkinId}`, adminSession, { action: "restore" });
    ok(res.status === 200, "admin restores");
    const [back] = await sql`select deleted_at from customers where id = ${walkinId}`;
    ok(back?.deleted_at === null, "deleted_at cleared");

    const hard = await probe(`/api/customers/${walkinId}`, adminSession, { method: "DELETE" });
    ok(hard.status === 405, "hard DELETE has no handler → 405 (CLAUDE.md §4)");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
