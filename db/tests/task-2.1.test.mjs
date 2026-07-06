// Task 2.1 acceptance tests — auth route guards, MFA gate, recovery codes.
// Run: pnpm build && pnpm test:db:2.1   (spawns `next start` on :3111)
//
// These are DIRECT-REQUEST tests per the done-criteria: raw fetches with
// crafted auth cookies (the exact @supabase/ssr format), no browser, no UI —
// proving the guards hold server-side. TOTP codes are computed in pure Node
// from the enrollment secret, so the full aal2 ladder is exercised for real.
// DESTRUCTIVE on staging (test users + profiles); guarded to the staging ref.

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
const APP = "http://127.0.0.1:3111";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

/* ── GoTrue REST helpers ────────────────────────────────────────────────── */
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
  const user = await gotrue("POST", "/admin/users", {
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  return user.id;
}
const PASSWORD = "Guard-Test-Only-2026!";
const signIn = (email) =>
  gotrue("POST", "/token?grant_type=password", { email, password: PASSWORD }, "anon").catch(
    async () => {
      // anon key goes in both headers for the password grant
      const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      });
      if (!res.ok) throw new Error(`password grant: ${res.status} ${await res.text()}`);
      return res.json();
    }
  );

/* ── TOTP in pure Node (RFC 6238, SHA-1, 30s, 6 digits) ────────────────── */
function base32decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
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
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

/* ── @supabase/ssr cookie format ────────────────────────────────────────── */
const projectRef = new URL(SUPA_URL).host.split(".")[0];
function sessionCookies(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${projectRef}-auth-token`;
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++)
    parts.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}
async function probe(path, session, init = {}) {
  return fetch(`${APP}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      ...(session ? { cookie: sessionCookies(session) } : {}),
      ...(init.headers ?? {}),
    },
  });
}
const location = (res) =>
  new URL(res.headers.get("location"), APP).pathname +
  new URL(res.headers.get("location"), APP).search;

/* ── boot the production server ─────────────────────────────────────────── */
console.log("setup — users, profiles, next start");
const staffId = await ensureUser("guard-staff@staging.test");
const freshAdminId = await ensureUser("guard-admin-fresh@staging.test");
const enrolledAdminId = await ensureUser("guard-admin-enrolled@staging.test");
const inactiveId = await ensureUser("guard-inactive@staging.test");
await sql`delete from profiles where id in (${staffId}, ${freshAdminId}, ${enrolledAdminId}, ${inactiveId})`;
await sql`insert into profiles (id, full_name, role, is_active) values
  (${staffId}, 'Guard Staff', 'staff', true),
  (${freshAdminId}, 'Guard Admin Fresh', 'admin', true),
  (${enrolledAdminId}, 'Guard Admin Enrolled', 'admin', true),
  (${inactiveId}, 'Guard Inactive', 'staff', false)`;

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3111"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const ready = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${APP}/login`);
      if (r.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
})();
if (!ready) {
  console.error("next start never became ready.\n" + serverLog.slice(-2000));
  server.kill();
  process.exit(1);
}

try {
  /* ═══ G1 — anonymous ═════════════════════════════════════════════════ */
  console.log("G1 — anonymous requests");
  {
    const dash = await probe("/dashboard");
    ok(
      [301, 302, 303, 307, 308].includes(dash.status) && location(dash) === "/login",
      "anon /dashboard → /login"
    );
    const admin = await probe("/admin");
    ok(location(admin) === "/login", "anon /admin → /login");
    const login = await probe("/login");
    ok(login.status === 200, "anon /login renders");
    const api = await probe("/api/auth/recovery-codes", null, { method: "POST" });
    ok(api.status === 401, "anon recovery-codes API → 401");
  }

  /* ═══ G2 — staff: admin routes unreachable server-side ═══════════════ */
  console.log("G2 — staff");
  {
    const session = await signIn("guard-staff@staging.test");
    ok((await probe("/dashboard", session)).status === 200, "staff /dashboard 200");
    const admin = await probe("/admin", session);
    ok(location(admin) === "/dashboard", "staff /admin → /dashboard (direct request)");
    const sub = await probe("/admin/anything", session);
    ok(location(sub) === "/dashboard", "staff /admin/* → /dashboard");
  }

  /* ═══ G3 — fresh admin: hard-locked to /mfa-setup (R-9.2) ════════════ */
  console.log("G3 — fresh admin before TOTP enrollment");
  {
    const session = await signIn("guard-admin-fresh@staging.test");
    ok(
      location(await probe("/admin", session)) === "/mfa-setup",
      "fresh admin /admin → /mfa-setup"
    );
    ok(
      location(await probe("/dashboard", session)) === "/mfa-setup",
      "fresh admin /dashboard → /mfa-setup (no roaming before enrollment)"
    );
    ok((await probe("/mfa-setup", session)).status === 200, "fresh admin /mfa-setup renders");
  }

  /* ═══ G4 — enrolled admin: aal1 blocked, aal2 admitted ═══════════════ */
  console.log("G4 — enrolled admin, the full aal ladder");
  let aal2Session;
  let recoveryCodes;
  {
    const aal1 = await signIn("guard-admin-enrolled@staging.test");
    const factor = await gotrue(
      "POST",
      "/factors",
      { factor_type: "totp", friendly_name: "test" },
      aal1.access_token
    );
    const challenge = await gotrue(
      "POST",
      `/factors/${factor.id}/challenge`,
      {},
      aal1.access_token
    );
    aal2Session = await gotrue(
      "POST",
      `/factors/${factor.id}/verify`,
      { challenge_id: challenge.id, code: totp(factor.totp.secret) },
      aal1.access_token
    );
    ok(!!aal2Session?.access_token, "TOTP enroll+challenge+verify via REST (Node-computed code)");

    ok((await probe("/admin", aal2Session)).status === 200, "aal2 admin /admin 200");
    ok(
      location(await probe("/login", aal2Session)) === "/dashboard",
      "aal2 admin bounced off /login"
    );

    const aal1Again = await signIn("guard-admin-enrolled@staging.test");
    ok(
      location(await probe("/admin", aal1Again)) === "/login?mfa=1",
      "enrolled admin at aal1 → /login?mfa=1 (challenge, not setup)"
    );
    ok(
      location(await probe("/dashboard", aal1Again)) === "/login?mfa=1",
      "aal1 admin cannot roam the app either"
    );
  }

  /* ═══ G5 — recovery codes [#24] ══════════════════════════════════════ */
  console.log("G5 — recovery codes: mint at aal2, consume at aal1");
  {
    const aal1 = await signIn("guard-admin-enrolled@staging.test");
    const denied = await probe("/api/auth/recovery-codes", aal1, { method: "POST" });
    ok(denied.status === 403, "minting codes at aal1 → 403");

    const minted = await probe("/api/auth/recovery-codes", aal2Session, { method: "POST" });
    recoveryCodes = (await minted.json()).codes;
    ok(minted.status === 200 && recoveryCodes?.length === 8, "aal2 mints 8 one-time codes");

    const bad = await probe("/api/auth/recover-mfa", aal1, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "XXXX-XXXX-XX" }),
    });
    ok(bad.status === 403, "wrong recovery code → uniform 403");

    const good = await probe("/api/auth/recover-mfa", aal1, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: recoveryCodes[0] }),
    });
    ok(good.status === 200, "valid recovery code accepted");
    const factors = await gotrue("GET", `/admin/users/${enrolledAdminId}`);
    ok(
      !(factors.factors ?? []).some((f) => f.status === "verified"),
      "TOTP factor unenrolled by recovery"
    );

    const reuse = await probe(
      "/api/auth/recover-mfa",
      await signIn("guard-admin-enrolled@staging.test"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: recoveryCodes[0] }),
      }
    );
    ok(reuse.status === 400 || reuse.status === 403, "recovery code is single-use");

    const back = await signIn("guard-admin-enrolled@staging.test");
    ok(
      location(await probe("/dashboard", back)) === "/mfa-setup",
      "recovered admin is routed back through /mfa-setup"
    );
  }

  /* ═══ G6 — deactivated user with a live session ══════════════════════ */
  console.log("G6 — deactivated user");
  {
    // Session minted while active, then deactivated: the very next request dies.
    await sql`update profiles set is_active = true where id = ${inactiveId}`;
    const session = await signIn("guard-inactive@staging.test");
    await sql`update profiles set is_active = false where id = ${inactiveId}`;
    const res = await probe("/dashboard", session);
    ok(
      location(res) === "/login?reason=inactive",
      "deactivated mid-session → signed out on next request"
    );
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
