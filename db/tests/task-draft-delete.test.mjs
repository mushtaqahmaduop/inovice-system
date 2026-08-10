// D-31 acceptance tests — deleting a draft.
// Run: pnpm build && pnpm test:db:draft-delete   (spawns `next start` on :3140)
//
// Done-criteria: a DRAFT can be erased by an admin or by the employee who
// created it, and by nobody else; a sealed invoice can never be deleted; the
// append-only guarantees the ledger rests on are unchanged for everything
// else; and each deletion leaves one tombstone naming who did it.
//
// NON-DESTRUCTIVE. Staging carries the owner's demo invoices, so this test
// truncates nothing: it makes its own customer and drafts and removes them
// again through the very feature under test. Its two users are reused across
// runs (never recreated) because the tombstones they leave behind reference
// their profile rows.

import { spawn } from "node:child_process";
import postgres from "postgres";

import { assertNotProduction } from "../guard.mjs";
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
assertNotProduction("task-draft-delete");
const APP = "http://127.0.0.1:3140";
const PASSWORD = "Draft-Delete-Test-2026!";
const ADMIN = "draft-del-admin@staging.test";
const STAFF = "draft-del-staff@staging.test";
const OTHER = "draft-del-other@staging.test";
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
// Reused, never deleted: a tombstone points at the profile row (SET NULL, but
// the row should survive so the link keeps working across runs).
async function ensureUser(email) {
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) {
    await gotrue("PUT", `/admin/users/${existing.id}`, { password: PASSWORD });
    return existing.id;
  }
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
const del = (path, session) =>
  fetch(`${APP}${path}`, {
    method: "DELETE",
    redirect: "manual",
    headers: session ? { cookie: cookieFor(session) } : {},
  });
const rpc = (fn, body, session) =>
  fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

/* ── setup — own fixtures only ─────────────────────────────────────────── */
console.log("setup — users, own customer, next start");
const adminId = await ensureUser(ADMIN);
const staffId = await ensureUser(STAFF);
const otherId = await ensureUser(OTHER);
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'Draft-Delete Admin', 'admin', true),
  (${staffId}, 'Draft-Delete Staff', 'staff', true),
  (${otherId}, 'Draft-Delete Other', 'staff', true)
  on conflict (id) do update set role = excluded.role, is_active = true,
    full_name = excluded.full_name`;

const [cust] = await sql`insert into customers (type, name)
  values ('walk_in', 'D31 Delete Fixture') returning id`;

async function mkDraft(authorId) {
  const [inv] = await sql`insert into invoices (customer_id, created_by, notes)
    values (${cust.id}, ${authorId}, 'D31 fixture') returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Typing', 1, 20000, 10000)`;
  await sql`insert into invoice_events (invoice_id, event_type, actor_id, payload)
    values (${inv.id}, 'created', ${authorId}, '{}'::jsonb)`;
  return inv.id;
}
const exists = async (id) => (await sql`select 1 from invoices where id = ${id}`).length > 0;
const eventsOf = async (id) =>
  (await sql`select count(*)::int as n from invoice_events where invoice_id = ${id}`)[0].n;

const adminSession = await signIn(ADMIN);
const staffSession = await signIn(STAFF);
const otherSession = await signIn(OTHER);

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3140"], {
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
  await sql.end();
  process.exit(1);
}

const madeDrafts = [];
try {
  /* ═══ D1 — who may delete ═════════════════════════════════════════════ */
  console.log("D1 — authorization, at both layers");
  {
    const draft = await mkDraft(staffId);
    madeDrafts.push(draft);

    ok((await del(`/api/invoices/${draft}`, null)).status === 401, "anon → 401");
    ok(
      (await del(`/api/invoices/${draft}`, otherSession)).status === 403,
      "another employee → 403"
    );
    ok(await exists(draft), "…and the draft is still there");

    // DB layer: the same refusal when the function is called directly.
    const direct = await rpc("delete_draft", { p_invoice_id: draft }, otherSession);
    const body = await direct.text();
    ok(
      !direct.ok && /only an admin or the employee/.test(body),
      "direct PostgREST RPC by another employee is refused inside Postgres"
    );
    ok(await exists(draft), "…and still there after the direct attempt");

    ok((await del(`/api/invoices/${draft}`, staffSession)).status === 200, "its author → 200");
    ok(!(await exists(draft)), "…the draft is gone");
    ok((await eventsOf(draft)) === 0, "…and its events went with it");
  }

  /* ═══ D2 — an admin may delete someone else's draft ═══════════════════ */
  console.log("D2 — admin override");
  {
    const draft = await mkDraft(staffId);
    madeDrafts.push(draft);
    ok((await del(`/api/invoices/${draft}`, adminSession)).status === 200, "admin → 200");
    ok(!(await exists(draft)), "…the draft is gone");
  }

  /* ═══ D3 — the tombstone ══════════════════════════════════════════════ */
  console.log("D3 — the audit row");
  {
    const rows = await sql`select * from deleted_drafts
      where invoice_id = any(${madeDrafts}) order by deleted_at`;
    ok(rows.length === 2, `one tombstone per deleted draft (got ${rows.length})`);
    ok(
      rows.every((r) => r.customer_name === "D31 Delete Fixture" && r.line_count === 1),
      "each records the customer and how many lines were lost"
    );
    ok(
      rows[0].deleted_by === staffId && rows[0].deleted_by_name === "Draft-Delete Staff",
      "the author's own deletion names the author"
    );
    ok(
      rows[1].deleted_by === adminId && rows[1].draft_created_by === staffId,
      "the admin's deletion names the admin AND the employee whose draft it was"
    );
    // Append-only itself: the record of a deletion cannot be quietly removed.
    const upd = await sql`update deleted_drafts set deleted_by_name = 'nobody'
      where id = ${rows[0].id}`.catch((e) => e);
    ok(upd instanceof Error, "a tombstone cannot be edited");
    const dropped = await sql`delete from deleted_drafts where id = ${rows[0].id}`.catch((e) => e);
    ok(dropped instanceof Error, "a tombstone cannot be deleted");
  }

  /* ═══ D4 — sealed invoices are untouchable ════════════════════════════ */
  console.log("D4 — the ledger is unchanged");
  {
    const [sealed] = await sql`select id, invoice_number from invoices
      where status = 'issued' order by created_at limit 1`;
    if (!sealed) {
      ok(false, "expected at least one sealed invoice on staging to test against");
    } else {
      const before = await eventsOf(sealed.id);
      ok(
        (await del(`/api/invoices/${sealed.id}`, adminSession)).status === 409,
        `admin deleting sealed ${sealed.invoice_number} → 409`
      );
      const direct = await rpc("delete_draft", { p_invoice_id: sealed.id }, adminSession);
      ok(
        !direct.ok && /only drafts may be deleted/.test(await direct.text()),
        "…and the DB function refuses it too"
      );
      ok(await exists(sealed.id), "…the sealed invoice is still there");
      ok((await eventsOf(sealed.id)) === before, "…with its event trail intact");

      // The open door is scoped to delete_draft(): plain DELETEs on a sealed
      // invoice's events still raise, flag or no flag.
      // Catch OUTSIDE begin(): the raise aborts the transaction, so catching
      // inside just moves the failure to the COMMIT.
      let forged;
      try {
        forged = await sql.begin(async (tx) => {
          await tx`select set_config('app.draft_purge', ${sealed.id}::text, true)`;
          await tx`delete from invoice_events where invoice_id = ${sealed.id}`;
          return "deleted";
        });
      } catch (e) {
        forged = e.message;
      }
      ok(
        /append-only/.test(String(forged)),
        "setting the purge flag by hand cannot erase a sealed invoice's events"
      );
      // …and payments keep the original, unconditional guard.
      const pay = await sql`select id from payments limit 1`;
      if (pay.length) {
        const res = await sql`delete from payments where id = ${pay[0].id}`.catch((e) => e);
        ok(res instanceof Error, "payments are still append-only");
      } else {
        ok(true, "payments are still append-only (no payment rows to try)");
      }
    }
  }

  /* ═══ D5 — a missing draft answers honestly ═══════════════════════════ */
  console.log("D5 — edges");
  {
    const gone = madeDrafts[0];
    ok((await del(`/api/invoices/${gone}`, adminSession)).status === 404, "already deleted → 404");
    ok((await del(`/api/invoices/not-a-uuid`, adminSession)).status === 400, "bad id → 400");
  }
} catch (err) {
  // Never let a thrown error read as "everything passed" — an escaped
  // exception skips the remaining checks, which is a failure, not silence.
  failed++;
  console.error(`  ✗ the run threw before finishing: ${err?.message ?? err}`);
} finally {
  server.kill();
  // Fixtures out — through the feature itself where possible.
  for (const id of madeDrafts) {
    if (await exists(id)) await sql`select delete_draft(${id})`.catch(() => {});
  }
  await sql`delete from customers where id = ${cust.id}`.catch(() => {});
  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}
