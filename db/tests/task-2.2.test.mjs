// Task 2.2 acceptance tests — user management API + session revocation.
// Run: pnpm build && pnpm test:db:2.2   (spawns `next start` on :3112)
//
// Acceptance criterion [#24]: a revoked/deactivated user is locked out within
// N minutes. Here N is measured: the middleware validates the session against
// the auth server on EVERY request, so lockout lands on the very next request
// after revocation — seconds, not minutes. RLS is_active enforcement was
// separately proven in task-1.3 (R5).
// DESTRUCTIVE on staging (test users/profiles); guarded to the staging ref.

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
const APP = "http://127.0.0.1:3112";
const PASSWORD = "Mgmt-Test-Only-2026!";
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
async function signIn(email, password = PASSWORD) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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
const location = (res) => {
  const u = new URL(res.headers.get("location"), APP);
  return u.pathname + u.search;
};

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — admin (aal2), staff, next start");
const adminId = await ensureUser("mgmt-admin@staging.test");
const staffId = await ensureUser("mgmt-staff@staging.test");
await sql`delete from profiles where id in (${adminId}, ${staffId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Mgmt Admin', 'admin', true),
  (${staffId}, 'Mgmt Staff', 'staff', true)`;
// remove any prior test target so creation is repeatable
const CREATED_EMAIL = "mgmt-created@staging.test";
{
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const prior = (list.users ?? []).find((u) => u.email === CREATED_EMAIL);
  if (prior) {
    await sql`delete from profiles where id = ${prior.id}`;
    await gotrue("DELETE", `/admin/users/${prior.id}`);
  }
}
const adminSession = await toAal2("mgmt-admin@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3112"], {
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
  /* ═══ U1 — authorization on the management API ═══════════════════════ */
  console.log("U1 — only aal2 admins manage users");
  {
    const anon = await post("/api/admin/users", null, {});
    ok(anon.status === 401, "anon → 401");
    const staffSession = await signIn("mgmt-staff@staging.test");
    const staff = await post("/api/admin/users", staffSession, {
      fullName: "X Y",
      email: "x@y.test",
      password: "irrelevant-123",
      role: "staff",
    });
    ok(staff.status === 403, "staff → 403");
    const aal1Admin = await signIn("mgmt-admin@staging.test");
    const halfAdmin = await post("/api/admin/users", aal1Admin, {
      fullName: "X Y",
      email: "x@y.test",
      password: "irrelevant-123",
      role: "staff",
    });
    ok(halfAdmin.status === 403, "aal1 admin (no TOTP this session) → 403");
    const revokeByStaff = await post(`/api/admin/users/${adminId}`, staffSession, {
      action: "revoke_sessions",
    });
    ok(revokeByStaff.status === 403, "staff cannot revoke sessions");
  }

  /* ═══ U2 — create account ════════════════════════════════════════════ */
  console.log("U2 — admin creates a staff account");
  let createdId;
  {
    const bad = await post("/api/admin/users", adminSession, {
      fullName: "New Staff",
      email: "not-an-email",
      password: "short",
      role: "staff",
    });
    ok(bad.status === 400, "zod rejects bad input");
    const res = await post("/api/admin/users", adminSession, {
      fullName: "Mgmt Created",
      email: CREATED_EMAIL,
      password: "Initial-Pass-2026!",
      role: "staff",
    });
    createdId = (await res.json()).id;
    ok(res.status === 201 && !!createdId, "creation returns 201 + id");
    const [profile] = await sql`select role, is_active from profiles where id = ${createdId}`;
    ok(profile?.role === "staff" && profile.is_active === true, "profile row staff+active");
    const dup = await post("/api/admin/users", adminSession, {
      fullName: "Mgmt Created",
      email: CREATED_EMAIL,
      password: "Initial-Pass-2026!",
      role: "staff",
    });
    ok(dup.status === 409, "duplicate email → 409");
    const session = await signIn(CREATED_EMAIL, "Initial-Pass-2026!");
    ok((await probe("/dashboard", session)).status === 200, "new staff signs in and works");
  }

  /* ═══ U3 — session revocation: lockout on the NEXT request ═══════════ */
  console.log("U3 — revocation timing");
  {
    const victim = await signIn(CREATED_EMAIL, "Initial-Pass-2026!");
    ok((await probe("/dashboard", victim)).status === 200, "victim session live");
    const t0 = Date.now();
    const revoke = await post(`/api/admin/users/${createdId}`, adminSession, {
      action: "revoke_sessions",
    });
    ok(revoke.status === 200, "admin revokes all sessions");
    const after = await probe("/dashboard", victim);
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    ok(
      [301, 302, 303, 307, 308].includes(after.status) && location(after) === "/login",
      `revoked session dead on next request (${seconds}s — criterion: minutes)`
    );
    const canSignInAgain = await signIn(CREATED_EMAIL, "Initial-Pass-2026!");
    ok(!!canSignInAgain.access_token, "revocation ≠ deactivation: sign-in still allowed");
  }

  /* ═══ U4 — deactivate / reactivate ═══════════════════════════════════ */
  console.log("U4 — deactivation");
  {
    const victim = await signIn(CREATED_EMAIL, "Initial-Pass-2026!");
    const res = await post(`/api/admin/users/${createdId}`, adminSession, {
      action: "deactivate",
    });
    ok(res.status === 200, "admin deactivates the account");
    const after = await probe("/dashboard", victim);
    ok(location(after).startsWith("/login"), "deactivated user locked out immediately");
    const self = await post(`/api/admin/users/${adminId}`, adminSession, {
      action: "deactivate",
    });
    ok(self.status === 400, "admin cannot deactivate their own account");
    const re = await post(`/api/admin/users/${createdId}`, adminSession, {
      action: "reactivate",
    });
    ok(re.status === 200, "reactivate succeeds");
    const back = await signIn(CREATED_EMAIL, "Initial-Pass-2026!");
    ok((await probe("/dashboard", back)).status === 200, "reactivated user works after sign-in");
  }

  /* ═══ U5 — the management page itself is admin-gated ═════════════════ */
  console.log("U5 — /admin/users route");
  {
    const staffSession = await signIn("mgmt-staff@staging.test");
    ok(location(await probe("/admin/users", staffSession)) === "/dashboard",
      "staff GET /admin/users → /dashboard");
    ok((await probe("/admin/users", adminSession)).status === 200, "aal2 admin renders the page");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
