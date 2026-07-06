// Sidebar count badges acceptance tests (UI slice, DESIGN_BRIEF §3 #9).
// Run: pnpm build && pnpm test:db:badges   (spawns `next start` on :3128)
//
// Proves /api/nav-counts: anonymous → 401; staff → 200 with drafts/overdue
// counts that agree with direct SQL over the same predicate the invoices
// table renders (due_date, else issue_date + settings.due_days_default).
// NON-DESTRUCTIVE to invoice data; only the badge-staff test user is reset.

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
const APP = "http://127.0.0.1:3128";
const PASSWORD = "Badge-Test-Only-2026!";
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
const get = (path, session) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });

/* ── setup ─────────────────────────────────────────────────────────────── */
console.log("setup — staff user, next start");
const staffId = await ensureUser("badge-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Badge Staff', 'staff', true)`;
const staffSession = await signIn("badge-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3128"], {
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
  /* ═══ B1 — auth surface ════════════════════════════════════════════════ */
  console.log("B1 — auth");
  {
    const anon = await get("/api/nav-counts", null);
    ok(anon.status === 401, `anon GET /api/nav-counts → 401 (got ${anon.status})`);
  }

  /* ═══ B2 — staff counts agree with SQL ═════════════════════════════════ */
  console.log("B2 — staff counts vs direct SQL");
  {
    const res = await get("/api/nav-counts", staffSession);
    ok(res.status === 200, `staff GET /api/nav-counts → 200 (got ${res.status})`);
    const body = await res.json();
    ok(Number.isInteger(body.drafts) && body.drafts >= 0, `drafts is a count (${body.drafts})`);
    ok(Number.isInteger(body.overdue) && body.overdue >= 0, `overdue is a count (${body.overdue})`);

    const [{ n: drafts }] =
      await sql`select count(*)::int as n from invoices where status = 'draft'`;
    ok(body.drafts === drafts, `drafts matches SQL (${body.drafts} = ${drafts})`);

    // Same predicate as the API/table: due_date, else issue_date + default.
    const [{ n: overdue }] = await sql`
      select count(*)::int as n
        from invoice_list
       where status = 'issued'
         and payment_status <> 'paid'
         and coalesce(
               due_date,
               issue_date + (select due_days_default from settings limit 1)
             ) < current_date`;
    ok(body.overdue === overdue, `overdue matches SQL (${body.overdue} = ${overdue})`);

    ok(
      Object.keys(body).sort().join(",") === "drafts,overdue",
      "response carries only the two counts"
    );
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
