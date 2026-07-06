// Task 2.3 acceptance tests — app shell + global search scaffold (D-18).
// Run: pnpm build && pnpm test:db:2.3   (spawns `next start` on :3113)
//
// Proves the /api/search route: auth-gated, zod-validated, RLS-scoped, and
// backed by the trigram indexes — including the [#11] requirement that an
// issued invoice stays findable by its SNAPSHOT name after the customer
// record is renamed. DESTRUCTIVE on staging (truncates invoice/customer
// data like the other suites); guarded to the staging ref.

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
const APP = "http://127.0.0.1:3113";
const PASSWORD = "Search-Test-Only-2026!";

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });
    try {
      await sql`select 1`;
      return sql;
    } catch (e) {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (attempt >= 5 || !/ENOTFOUND|EAI_AGAIN|ECONNRESET/.test(String(e))) throw e;
      console.log(`  (connect attempt ${attempt} failed: ${e.code ?? e}; retrying)`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
const sql = await connectWithRetry();

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
const search = (q, session) =>
  fetch(`${APP}/api/search?q=${encodeURIComponent(q)}`, {
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });

/* ── setup: fixtures + staff user + next start ─────────────────────────── */
console.log("setup — fixtures, staff user, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Staging Test Co', true, 500, 'INV-{NN}')`;

const [trigramCo] = await sql`insert into customers (type, name, trn, address, phone)
  values ('regular', 'Searchable Trigram Traders', '100000000000003', 'Deira, Dubai', '+971-50-0000000')
  returning id, name`;
await sql`insert into customers (type, name) values ('walk_in', 'Walkin Zed')`;
await sql`insert into customers (type, name, deleted_at)
  values ('regular', 'Ghost Deleted Client', now())`;

// Draft for the same customer — must stay invisible to global search
// (no number, no snapshot until issue).
const [draft] = await sql`insert into invoices (customer_id) values (${trigramCo.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${draft.id}, 1, 'Draft-only line', 1, 10000, 5000)`;

// Issued invoice — created draft-first, sealed through issue_invoice() (the
// only sanctioned path; owner connection passes assert_active_app_user()).
const [toIssue] =
  await sql`insert into invoices (customer_id) values (${trigramCo.id}) returning id`;
await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
  values (${toIssue.id}, 1, 'Attestation service', 1, 20000, 10000)`;
const [issued] = await sql`select * from issue_invoice(${toIssue.id})`;
console.log(`  issued ${issued.invoice_number}`);

const staffId = await ensureUser("search-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Search Staff', 'staff', true)`;
const staffSession = await signIn("search-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3113"], {
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
  /* ═══ S1 — the route is auth-gated ═════════════════════════════════════ */
  console.log("S1 — authorization");
  {
    ok((await search("trigram", null)).status === 401, "anon → 401");
    ok((await search("trigram", staffSession)).status === 200, "signed-in staff → 200");
  }

  /* ═══ S2 — input validation ════════════════════════════════════════════ */
  console.log("S2 — validation");
  {
    ok((await search("", staffSession)).status === 400, "empty q → 400");
    ok((await search("a", staffSession)).status === 400, "1-char q → 400");
    ok((await search("x".repeat(65), staffSession)).status === 400, "65-char q → 400");
    const junk = await (await search("%_*,()", staffSession)).json();
    ok(
      junk.customers.length === 0 && junk.invoices.length === 0,
      "wildcard/PostgREST syntax chars sanitize to an empty search"
    );
  }

  /* ═══ S3 — customer search over the trigram index ══════════════════════ */
  console.log("S3 — customers");
  {
    const r = await (await search("trigram", staffSession)).json();
    ok(
      r.customers.some((c) => c.name === "Searchable Trigram Traders" && c.type === "regular"),
      "finds customer by partial name, case-insensitive"
    );
    const ghost = await (await search("Ghost Deleted", staffSession)).json();
    ok(ghost.customers.length === 0, "soft-deleted customers are excluded");
    const walkin = await (await search("walkin", staffSession)).json();
    ok(
      walkin.customers.some((c) => c.type === "walk_in"),
      "walk-ins are searchable too"
    );
  }

  /* ═══ S4 — invoice search: number + snapshot name, drafts invisible ════ */
  console.log("S4 — invoices");
  {
    const byNumber = await (await search(issued.invoice_number.toLowerCase(), staffSession)).json();
    ok(
      byNumber.invoices.some((i) => i.invoice_number === issued.invoice_number),
      `finds issued invoice by number (${issued.invoice_number}, lowercased query)`
    );
    const bySnapshot = await (await search("Trigram Traders", staffSession)).json();
    ok(
      bySnapshot.invoices.some(
        (i) => i.id === issued.id && i.customer_name === "Searchable Trigram Traders"
      ),
      "finds issued invoice by snapshot customer name"
    );
    ok(
      !bySnapshot.invoices.some((i) => i.id === draft.id),
      "draft (no number, no snapshot) does not appear"
    );
    ok(
      bySnapshot.invoices.every((i) => i.status !== "draft"),
      "no draft leaks into invoice results at all"
    );
  }

  /* ═══ S5 — [#11] snapshot survives a customer rename ═══════════════════ */
  console.log("S5 — snapshot durability");
  {
    await sql`update customers set name = 'Renamed After Issue LLC' where id = ${trigramCo.id}`;
    const old = await (await search("Trigram Traders", staffSession)).json();
    ok(
      old.invoices.some((i) => i.id === issued.id),
      "issued invoice still found under the ORIGINAL (snapshot) name"
    );
    ok(
      old.customers.length === 0,
      "renamed customer no longer matches the old name in customer results"
    );
    const renamed = await (await search("Renamed After", staffSession)).json();
    ok(
      renamed.customers.some((c) => c.id === trigramCo.id),
      "customer found under new name"
    );
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
