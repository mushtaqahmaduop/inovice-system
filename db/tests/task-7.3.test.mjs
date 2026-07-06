// Task 7.3 acceptance tests — security sweep.
// Run: pnpm build && pnpm test:db:7.3   (spawns `next start` on :3127)
//
// Sweeps EVERY mutation endpoint as anonymous (all must answer 401, never
// 500 or success), proves the recover-mfa throttle (429 after 5 tries,
// Retry-After set), and re-asserts that staff sessions cannot reach any
// admin surface. DESTRUCTIVE only to test users; invoice data untouched.

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
const APP = "http://127.0.0.1:3127";
const PASSWORD = "Sec-Test-Only-2026!";
const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));

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
const post = (path, session, body = {}) =>
  fetch(`${APP}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { cookie: cookieFor(session) } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (path, session) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — users, next start");
const staffId = await ensureUser("sec-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Sec Staff', 'staff', true)`;
const staffSession = await signIn("sec-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3127"], {
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

const UUID = "00000000-0000-4000-8000-000000000000";

try {
  /* ═══ S1 — anonymous sweep: every mutation endpoint answers 401 ════════ */
  console.log("S1 — anonymous sweep (401, never 500 or success)");
  {
    const posts = [
      "/api/customers",
      `/api/customers/${UUID}`,
      "/api/invoices",
      `/api/invoices/${UUID}`,
      `/api/invoices/${UUID}/payments`,
      "/api/services",
      `/api/services/${UUID}`,
      "/api/admin/users",
      `/api/admin/users/${UUID}`,
      "/api/admin/settings",
      "/api/admin/payment-methods",
      `/api/admin/payment-methods/${UUID}`,
      "/api/auth/recover-mfa",
      "/api/auth/recovery-codes",
    ];
    for (const p of posts) {
      const res = await post(p, null);
      ok(res.status === 401, `anon POST ${p} → 401 (got ${res.status})`);
    }
    for (const p of ["/api/search?q=test", "/api/export/invoices"]) {
      const res = await get(p, null);
      ok(res.status === 401, `anon GET ${p} → 401 (got ${res.status})`);
    }
  }

  /* ═══ S2 — staff cannot touch any admin surface ════════════════════════ */
  console.log("S2 — staff vs admin surfaces");
  {
    const adminPosts = [
      "/api/admin/users",
      `/api/admin/users/${UUID}`,
      "/api/admin/settings",
      "/api/admin/payment-methods",
      `/api/admin/payment-methods/${UUID}`,
    ];
    for (const p of adminPosts) {
      const res = await post(p, staffSession);
      ok(res.status === 403, `staff POST ${p} → 403 (got ${res.status})`);
    }
    ok((await get("/api/export/invoices", staffSession)).status === 403, "staff export → 403");
  }

  /* ═══ S3 — recover-mfa throttle ════════════════════════════════════════ */
  console.log("S3 — recovery-code brute-force brake");
  {
    let last;
    for (let i = 1; i <= 5; i++) {
      last = await post("/api/auth/recover-mfa", staffSession, { code: "WRONGCODE" + i });
    }
    ok(last.status === 400, "attempts 1–5 pass the limiter (fail on their own merits)");
    const sixth = await post("/api/auth/recover-mfa", staffSession, { code: "WRONGCODE6" });
    ok(sixth.status === 429, "attempt 6 → 429");
    ok(!!sixth.headers.get("retry-after"), "Retry-After header present");
    const seventh = await post("/api/auth/recover-mfa", staffSession, { code: "WRONGCODE7" });
    ok(seventh.status === 429, "still throttled on attempt 7");
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
