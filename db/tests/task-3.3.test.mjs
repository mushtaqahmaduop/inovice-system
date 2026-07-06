// Task 3.3 acceptance tests — services catalogue CRUD ([#25]).
// Run: pnpm build && pnpm test:db:3.3   (spawns `next start` on :3116)
//
// Proves: staff read / admin write (RLS §5), integer-fils enforcement on
// the wire (no decimals ever reach the DB — CLAUDE.md §3.3), deactivate vs
// soft-delete, restore, no hard DELETE, and a large-fils round-trip (§7).
// NON-destructive: test rows are removed at teardown; seed data untouched.

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
const APP = "http://127.0.0.1:3116";
const PASSWORD = "Svc-Test-Only-2026!";
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
console.log("setup — users, next start (seed data untouched)");
await sql`delete from services where name like 'ZZ Test %'`; // stale runs

const adminId = await ensureUser("svc-admin@staging.test");
const staffId = await ensureUser("svc-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Svc Admin', 'admin', true),
  (${staffId}, 'Svc Staff', 'staff', true)`;
const adminSession = await toAal2("svc-admin@staging.test");
const staffSession = await signIn("svc-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3116"], {
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

let svcId;
try {
  /* ═══ V1 — read for all, write for admin only ══════════════════════════ */
  console.log("V1 — authorization");
  {
    ok((await probe("/services", staffSession)).status === 200, "staff renders /services (read)");
    const anon = await probe("/services", null);
    ok([301, 302, 303, 307, 308].includes(anon.status), "anon → redirect to login");
    ok(
      (await post("/api/services", staffSession, { name: "ZZ Test Nope" })).status === 403,
      "staff create → 403"
    );
    ok((await post("/api/services", null, { name: "ZZ Test Nope" })).status === 401, "anon → 401");
  }

  /* ═══ V2 — integer-fils enforcement on the wire (§3.3) ═════════════════ */
  console.log("V2 — money validation");
  {
    ok(
      (await post("/api/services", adminSession, { name: "ZZ Test Frac", govtFee: 12.5 }))
        .status === 400,
      "fractional fils → 400 (decimals never cross the wire)"
    );
    ok(
      (await post("/api/services", adminSession, { name: "ZZ Test Neg", serviceFee: -100 }))
        .status === 400,
      "negative fee → 400"
    );
    ok(
      (await post("/api/services", adminSession, { name: "" })).status === 400,
      "empty name → 400"
    );
  }

  /* ═══ V3 — create + large-fils round-trip (§7) ═════════════════════════ */
  console.log("V3 — create");
  {
    const res = await post("/api/services", adminSession, {
      name: "ZZ Test Attestation",
      unit: "doc",
      govtFee: 999_999_999, // ~10M AED — far below 2^53 but past int32
      serviceFee: 2500,
    });
    svcId = (await res.json()).id;
    ok(res.status === 201 && !!svcId, "admin creates a service → 201");
    const [row] = await sql`select * from services where id = ${svcId}`;
    ok(Number(row.govt_fee) === 999_999_999, "large fils value round-trips exactly (§7)");
    ok(Number(row.service_fee) === 2500 && row.unit === "doc", "fees + unit stored as sent");
    ok(row.is_active === true, "new service active by default");
  }

  /* ═══ V4 — update / deactivate / soft delete / restore ═════════════════ */
  console.log("V4 — lifecycle");
  {
    ok(
      (
        await post(`/api/services/${svcId}`, adminSession, {
          action: "update",
          data: { serviceFee: 3000, unit: "person" },
        })
      ).status === 200,
      "admin updates fees + unit"
    );
    const [row] = await sql`select service_fee, unit from services where id = ${svcId}`;
    ok(Number(row.service_fee) === 3000 && row.unit === "person", "update landed");

    ok(
      (
        await post(`/api/services/${svcId}`, adminSession, {
          action: "update",
          data: { isActive: false },
        })
      ).status === 200,
      "deactivate (hidden from 4.1b picker, still in catalogue)"
    );
    ok(
      (await post(`/api/services/${svcId}`, adminSession, { action: "soft_delete" })).status ===
        200,
      "soft delete"
    );
    const [del] = await sql`select deleted_at from services where id = ${svcId}`;
    ok(del.deleted_at !== null, "deleted_at set — row preserved (invoices priced off it)");
    ok(
      (await post(`/api/services/${svcId}`, adminSession, { action: "restore" })).status === 200,
      "restore"
    );
    ok(
      (await probe(`/api/services/${svcId}`, adminSession, { method: "DELETE" })).status === 405,
      "hard DELETE has no handler → 405"
    );
    ok(
      (await post(`/api/services/${svcId}`, adminSession, { action: "update", data: {} }))
        .status === 400,
      "empty update → 400"
    );
    ok(
      (
        await post(`/api/services/00000000-0000-4000-8000-000000000000`, adminSession, {
          action: "soft_delete",
        })
      ).status === 404,
      "unknown id → 404"
    );
  }
} finally {
  server.kill();
  await sql`delete from services where name like 'ZZ Test %'`.catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
