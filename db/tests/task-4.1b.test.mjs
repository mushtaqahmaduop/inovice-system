// Task 4.1b acceptance tests — draft persistence + resume.
// Run: pnpm build && pnpm test:db:4.1b   (spawns `next start` on :3117)
//
// Proves: draft create writes invoice + columns + lines + junction fees +
// 'created' event; update_draft replaces children wholesale and appends
// 'draft_updated'; sealed invoices answer 409 and the resume page shows the
// lock notice; zod rejects malformed drafts. DESTRUCTIVE; guarded to ref.

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
const APP = "http://127.0.0.1:3117";
const PASSWORD = "Drft-Test-Only-2026!";
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
console.log("setup — clean tables, users, next start");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers,
  invoice_counters, settings cascade`;
await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
          values ('Draft Test Co', true, 500, 'INV-{NN}')`;
const [custA] = await sql`insert into customers (type, name, trn)
  values ('regular', 'Draft Cust A', '100000000000003') returning id`;
const [custB] = await sql`insert into customers (type, name)
  values ('walk_in', 'Draft Cust B') returning id`;

const staffId = await ensureUser("drft-staff@staging.test");
await sql`delete from profiles where id = ${staffId}`;
await sql`insert into profiles (id, full_name, role, is_active)
  values (${staffId}, 'Drft Staff', 'staff', true)`;
const staffSession = await signIn("drft-staff@staging.test");

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3117"], {
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

const DRAFT = {
  customerId: null, // filled below
  issueDate: "2026-07-05",
  notes: "Test notes",
  terms: "Due on receipt",
  columns: [
    { label: "Courier", vatable: true },
    { label: "Stamp", vatable: false },
  ],
  lines: [
    {
      description: "Attestation",
      qty: 2,
      govtFee: 20000,
      serviceFee: 10000,
      extraFees: { 0: 500 },
    },
    { description: "Typing", qty: 1, govtFee: 0, serviceFee: 5000, extraFees: { 1: 1500 } },
  ],
};

try {
  /* ═══ D1 — auth + validation ═══════════════════════════════════════════ */
  console.log("D1 — auth + validation");
  {
    ok((await post("/api/invoices", null, {})).status === 401, "anon → 401");
    ok(
      (await post("/api/invoices", staffSession, { ...DRAFT, customerId: custA.id, lines: [] }))
        .status === 400,
      "no lines → 400"
    );
    ok(
      (
        await post("/api/invoices", staffSession, {
          ...DRAFT,
          customerId: custA.id,
          lines: [{ description: "x", qty: 1, govtFee: 0, serviceFee: 100, extraFees: { 7: 100 } }],
        })
      ).status === 400,
      "extra fee referencing unknown column index → 400"
    );
    ok(
      (
        await post("/api/invoices", staffSession, {
          ...DRAFT,
          customerId: custA.id,
          lines: [{ description: "x", qty: 1, govtFee: 0, serviceFee: 100.5, extraFees: {} }],
        })
      ).status === 400,
      "fractional fils → 400"
    );
    ok(
      (
        await post("/api/invoices", staffSession, {
          ...DRAFT,
          customerId: "00000000-0000-4000-8000-000000000000",
        })
      ).status === 400,
      "unknown customer id → 400 (FK)"
    );
  }

  /* ═══ D2 — create draft ════════════════════════════════════════════════ */
  console.log("D2 — create");
  let draftId;
  {
    const res = await post("/api/invoices", staffSession, { ...DRAFT, customerId: custA.id });
    draftId = (await res.json()).id;
    ok(res.status === 201 && !!draftId, "staff creates a draft → 201");
    const [inv] = await sql`select * from invoices where id = ${draftId}`;
    ok(inv.status === "draft" && inv.invoice_number === null, "draft, NO number allocated");
    ok(
      inv.created_by === staffId && inv.notes === "Test notes",
      "created_by from session; fields stored"
    );
    const cols = await sql`select label, vatable, position from invoice_extra_columns
      where invoice_id = ${draftId} order by position`;
    ok(
      cols.length === 2 && cols[0].label === "Courier" && cols[0].vatable === true,
      "columns stored in order"
    );
    const lines =
      await sql`select * from invoice_lines where invoice_id = ${draftId} order by position`;
    ok(lines.length === 2 && Number(lines[0].govt_fee) === 20000, "lines stored");
    const fees = await sql`select f.amount, c.label from invoice_line_fees f
      join invoice_extra_columns c on c.id = f.column_id
      join invoice_lines l on l.id = f.line_id
      where l.invoice_id = ${draftId} order by f.amount`;
    ok(
      fees.length === 2 && Number(fees[0].amount) === 500 && fees[0].label === "Courier",
      "junction fees mapped to the right columns (zeros omitted)"
    );
    const events =
      await sql`select event_type, actor_id from invoice_events where invoice_id = ${draftId}`;
    ok(
      events.length === 1 && events[0].event_type === "created" && events[0].actor_id === staffId,
      "'created' event with session actor"
    );
    ok(
      (await probe(`/invoices/${draftId}/edit`, staffSession)).status === 200,
      "resume page renders"
    );
  }

  /* ═══ D3 — update_draft replaces children wholesale ════════════════════ */
  console.log("D3 — update");
  {
    const res = await post(`/api/invoices/${draftId}`, staffSession, {
      action: "update_draft",
      data: {
        customerId: custB.id,
        issueDate: null,
        notes: "Edited",
        terms: null,
        columns: [{ label: "Photocopy", vatable: true }],
        lines: [
          {
            description: "Only line now",
            qty: 3,
            govtFee: 100,
            serviceFee: 200,
            extraFees: { 0: 50 },
          },
        ],
      },
    });
    ok(res.status === 200, "update_draft → 200");
    const [inv] =
      await sql`select customer_id, notes, terms, issue_date from invoices where id = ${draftId}`;
    ok(
      inv.customer_id === custB.id && inv.notes === "Edited" && inv.terms === null,
      "invoice fields replaced"
    );
    const cols = await sql`select label from invoice_extra_columns where invoice_id = ${draftId}`;
    const lines =
      await sql`select description, qty from invoice_lines where invoice_id = ${draftId}`;
    const fees = await sql`select f.amount from invoice_line_fees f
      join invoice_lines l on l.id = f.line_id where l.invoice_id = ${draftId}`;
    ok(cols.length === 1 && cols[0].label === "Photocopy", "old columns gone, new in place");
    ok(lines.length === 1 && lines[0].qty === 3, "old lines gone, new in place");
    ok(fees.length === 1 && Number(fees[0].amount) === 50, "junction fees rebuilt");
    const events =
      await sql`select event_type from invoice_events where invoice_id = ${draftId} order by created_at`;
    ok(
      events.length === 2 && events[1].event_type === "draft_updated",
      "'draft_updated' appended (audit trail grows, never rewrites)"
    );
  }

  /* ═══ D4 — sealed invoices are closed here ═════════════════════════════ */
  console.log("D4 — sealed");
  {
    await sql`select * from issue_invoice(${draftId})`;
    const res = await post(`/api/invoices/${draftId}`, staffSession, {
      action: "update_draft",
      data: {
        customerId: custB.id,
        columns: [],
        lines: [{ description: "x", qty: 1, govtFee: 0, serviceFee: 1, extraFees: {} }],
      },
    });
    ok(res.status === 409, "update on issued → 409");
    const page = await probe(`/invoices/${draftId}/edit`, staffSession);
    const html = await page.text();
    ok(page.status === 200 && html.includes("sealed"), "resume page shows the sealed lock notice");
    ok(
      (
        await post(`/api/invoices/00000000-0000-4000-8000-000000000000`, staffSession, {
          action: "update_draft",
          data: {
            customerId: custB.id,
            columns: [],
            lines: [{ description: "x", qty: 1, govtFee: 0, serviceFee: 1, extraFees: {} }],
          },
        })
      ).status === 404,
      "unknown invoice → 404"
    );
  }
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
