// Task 1.3 acceptance tests — RLS matrix per SCHEMA_DESIGN §5.
// Run: pnpm test:db:1.3
//
// DESTRUCTIVE: wipes staging data. Guarded to the STAGING project ref.
// Strategy: real auth.users rows are created via the admin API (profiles has a
// hard FK to auth.users); each matrix check then runs inside a transaction as
// `SET LOCAL role authenticated/anon` + `request.jwt.claims` — byte-for-byte
// what PostgREST does, so these tests exercise the exact policy surface.

import postgres from "postgres";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url || !url.includes(STAGING_REF)) {
  console.error("Refusing to run: connection string is not the staging project.");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_REF)) {
  console.error("Refusing to run: SUPABASE_URL is not the staging project.");
  process.exit(1);
}

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    const sql = postgres(url, { max: 4, onnotice: () => {} });
    try {
      await sql`select 1`;
      return sql;
    } catch (e) {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (attempt >= 5 || !/ENOTFOUND|EAI_AGAIN|ECONNRESET/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}
const sql = await connectWithRetry();

// GoTrue admin REST API via fetch — supabase-js needs a native WebSocket
// (Node 21+) and this machine runs Node 20; the two admin calls we need are
// trivial over HTTP.
const AUTH_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function gotrue(method, path, body) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GoTrue ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

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
async function rejects(promise, pattern, label) {
  try {
    await promise;
    failed++;
    console.error(`  ✗ ${label} — expected rejection, got success`);
  } catch (e) {
    ok(pattern.test(String(e.message ?? e)), `${label} (got: ${String(e.message).slice(0, 80)})`);
  }
}

// Run fn inside one transaction impersonating a PostgREST caller.
function runAs(uid, fn, role = "authenticated") {
  return sql.begin(async (tx) => {
    const claims = uid ? JSON.stringify({ sub: uid, role }) : "";
    await tx`select set_config('request.jwt.claims', ${claims}, true),
                    set_config('role', ${role}, true)`;
    return fn(tx);
  });
}
const asAnon = (fn) => runAs(null, fn, "anon");

async function ensureUser(email) {
  const list = await gotrue("GET", "/admin/users?per_page=200");
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) await gotrue("DELETE", `/admin/users/${existing.id}`);
  const user = await gotrue("POST", "/admin/users", {
    email,
    password: "Rls-Test-Only-2026!",
    email_confirm: true,
  });
  return user.id;
}

/* ── fixtures (as table owner — bypasses RLS by design) ────────────────── */
console.log("setup — users, profiles, seed data");
await sql`truncate table invoice_events, payments, invoice_line_fees,
  invoice_extra_columns, invoice_lines, invoices, customers, invoice_counters,
  settings, payment_methods, services, profiles cascade`;

const adminId = await ensureUser("rls-admin@staging.test");
const staffId = await ensureUser("rls-staff@staging.test");
const inactiveId = await ensureUser("rls-inactive@staging.test");
const newUserId = await ensureUser("rls-new@staging.test"); // profile created BY admin in R4
await sql`insert into profiles (id, full_name, role, is_active) values
  (${adminId}, 'RLS Admin', 'admin', true),
  (${staffId}, 'RLS Staff', 'staff', true),
  (${inactiveId}, 'RLS Deactivated', 'staff', false)`;

await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
  values ('Staging Test Co', true, 500, 'INV-{NN}')`;
const [cust] = await sql`insert into customers (type, name) values ('regular', 'Matrix Customer')
  returning id`;
const [svc] = await sql`insert into services (name, govt_fee, service_fee)
  values ('Attestation', 10000, 2500) returning id`;
const [method] = await sql`insert into payment_methods (label) values ('Cash') returning id`;

async function mkDraft() {
  const [inv] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Line', 1, 0, 1000)`;
  return inv.id;
}
await mkDraft(); // a plain draft — R2 expects both a draft and an issued invoice
const issuedInv = await mkDraft();
await sql`select issue_invoice(${issuedInv})`; // owner path: auth.uid() null → guard skips
const [payment] = await sql`insert into payments (invoice_id, amount, method_id, received_on)
  values (${issuedInv}, 500, ${method.id}, current_date) returning id`;

/* ═══ R1 — anon gets NOTHING, visibly ══════════════════════════════════ */
console.log("R1 — anon: permission denied everywhere");
for (const t of ["settings", "profiles", "customers", "services", "payment_methods",
                 "invoices", "invoice_lines", "invoice_extra_columns",
                 "invoice_line_fees", "payments", "invoice_events", "invoice_counters"]) {
  await rejects(
    asAnon((tx) => tx.unsafe(`select * from public.${t} limit 1`)),
    /permission denied/,
    `anon SELECT ${t} denied`
  );
}

/* ═══ R2 — app_role() + read matrix ════════════════════════════════════ */
console.log("R2 — app_role() and the read matrix");
{
  const roleOf = (uid) => runAs(uid, async (tx) => (await tx`select app_role() as r`)[0].r);
  ok((await roleOf(adminId)) === "admin", "app_role() → admin");
  ok((await roleOf(staffId)) === "staff", "app_role() → staff");
  ok((await roleOf(inactiveId)) === null, "app_role() → NULL for deactivated (circuit-breaker)");

  const counts = await runAs(staffId, async (tx) => ({
    settings: (await tx`select * from settings`).length,
    profiles: (await tx`select * from profiles`).length,
    customers: (await tx`select * from customers`).length,
    services: (await tx`select * from services`).length,
    methods: (await tx`select * from payment_methods`).length,
    invoices: (await tx`select * from invoices`).length,
    lines: (await tx`select * from invoice_lines`).length,
    payments: (await tx`select * from payments`).length,
    events: (await tx`select * from invoice_events`).length,
  }));
  ok(counts.settings === 1, "staff reads settings");
  ok(counts.profiles === 3, "staff reads profiles (display)");
  ok(counts.customers === 1 && counts.services === 1 && counts.methods === 1,
    "staff reads customers/services/payment_methods");
  ok(counts.invoices === 2 && counts.lines === 2, "staff reads invoices + lines");
  ok(counts.payments === 1 && counts.events >= 1, "staff reads payments + events");
  await rejects(
    runAs(staffId, (tx) => tx`select * from invoice_counters`),
    /permission denied/,
    "staff cannot even SELECT invoice_counters (function-only)"
  );
}

/* ═══ R3 — staff writes ════════════════════════════════════════════════ */
console.log("R3 — staff: allowed and forbidden writes");
{
  const newCust = await runAs(staffId, async (tx) => {
    const [c] = await tx`insert into customers (type, name) values ('walk_in', 'Walk-in W')
      returning id`;
    await tx`update customers set phone = '+971-50-1111111' where id = ${c.id}`;
    return c.id;
  });
  ok(!!newCust, "staff creates + edits customers");
  await rejects(
    runAs(staffId, (tx) => tx`update customers set deleted_at = now() where id = ${newCust}`),
    /row-level security/,
    "staff cannot soft-delete a customer"
  );
  ok(
    (await runAs(staffId, (tx) => tx`update settings set company_name = 'Hacked'`)).count === 0,
    "staff UPDATE settings hits 0 rows"
  );
  await rejects(
    runAs(staffId, (tx) => tx`insert into services (name) values ('Rogue service')`),
    /row-level security/,
    "staff cannot create services"
  );
  ok(
    (await runAs(staffId, (tx) => tx`update services set service_fee = 1 where id = ${svc.id}`))
      .count === 0,
    "staff UPDATE services hits 0 rows"
  );
  await rejects(
    runAs(staffId, (tx) => tx`insert into payment_methods (label) values ('Barter')`),
    /row-level security/,
    "staff cannot create payment methods"
  );
  await rejects(
    runAs(staffId, (tx) =>
      tx`insert into profiles (id, full_name, role) values (${newUserId}, 'Rogue', 'admin')`),
    /row-level security/,
    "staff cannot create profiles (no self-made admins)"
  );
  ok(
    (await runAs(staffId, (tx) =>
      tx`update profiles set role = 'admin' where id = ${staffId}`)).count === 0,
    "staff cannot promote themselves (0 rows)"
  );

  // invoices: draft lifecycle allowed, sealing path blocked
  const staffDraft = await runAs(staffId, async (tx) => {
    const [i] = await tx`insert into invoices (customer_id) values (${cust.id}) returning id`;
    await tx`insert into invoice_lines (invoice_id, position, description, qty, service_fee)
      values (${i.id}, 1, 'Typing', 1, 777)`;
    await tx`update invoices set notes = 'staff draft' where id = ${i.id}`;
    return i.id;
  });
  ok(!!staffDraft, "staff creates a draft with lines and edits it");
  await rejects(
    runAs(staffId, (tx) =>
      tx`insert into invoices (customer_id, status, invoice_number, number_year, number_seq)
         values (${cust.id}, 'issued', 'INV-666', 2026, 666)`),
    /row-level security/,
    "forged pre-sealed INSERT rejected"
  );
  await rejects(
    runAs(staffId, (tx) => tx`update invoices set status = 'issued' where id = ${staffDraft}`),
    /row-level security/,
    "raw draft→issued UPDATE rejected (sealing only via issue_invoice)"
  );
  ok(
    (await runAs(staffId, (tx) =>
      tx`update invoices set notes = 'tamper' where id = ${issuedInv}`)).count === 0,
    "staff UPDATE on issued invoice hits 0 rows"
  );
  ok(
    (await runAs(staffId, (tx) => tx`delete from invoices where id = ${issuedInv}`)).count === 0,
    "staff DELETE on issued invoice hits 0 rows"
  );
  await rejects(
    runAs(staffId, (tx) =>
      tx`insert into invoice_lines (invoice_id, position, description, qty)
         values (${issuedInv}, 9, 'late line', 1)`),
    /row-level security|frozen/,
    "staff cannot add lines to an issued invoice"
  );

  // sealing through the function works for staff, with correct attribution
  const sealed = await runAs(staffId, async (tx) => {
    const [inv] = await tx`select * from issue_invoice(${staffDraft})`;
    return inv;
  });
  ok(sealed.status === "issued", "staff issues via issue_invoice()");
  ok(sealed.issued_by === staffId, "issued_by = staff uid from auth.uid()");
  const [ev] = await sql`select actor_id from invoice_events
    where invoice_id = ${staffDraft} and event_type = 'issued'`;
  ok(ev.actor_id === staffId, "event actor = staff uid");

  // payments/events: INSERT yes, UPDATE/DELETE denied at the privilege layer
  await runAs(staffId, (tx) =>
    tx`insert into payments (invoice_id, amount, method_id, received_on)
       values (${staffDraft}, 100, ${method.id}, current_date)`);
  ok(true, "staff records a payment");
  await rejects(
    runAs(staffId, (tx) => tx`update payments set amount = 1 where id = ${payment.id}`),
    /permission denied/,
    "staff payment UPDATE: permission denied (layer 1)"
  );
  await rejects(
    runAs(staffId, (tx) => tx`delete from payments where id = ${payment.id}`),
    /permission denied/,
    "staff payment DELETE: permission denied (layer 1)"
  );
  await rejects(
    runAs(staffId, (tx) => tx`update invoice_events set payload = '{}'`),
    /permission denied/,
    "staff event UPDATE: permission denied (layer 1)"
  );
}

/* ═══ R4 — admin writes ════════════════════════════════════════════════ */
console.log("R4 — admin: management surface");
{
  ok(
    (await runAs(adminId, (tx) => tx`update settings set tagline = 'Sealed & stamped'`)).count === 1,
    "admin updates settings"
  );
  await runAs(adminId, (tx) => tx`insert into services (name, govt_fee, service_fee)
    values ('Translation', 0, 4000)`);
  ok(true, "admin creates services");
  ok(
    (await runAs(adminId, (tx) =>
      tx`update services set is_active = false where id = ${svc.id}`)).count === 1,
    "admin edits services"
  );
  await runAs(adminId, (tx) => tx`insert into payment_methods (label, position) values ('Card', 1)`);
  ok(true, "admin creates payment methods");
  await runAs(adminId, (tx) =>
    tx`insert into profiles (id, full_name, role) values (${newUserId}, 'New Staff', 'staff')`);
  ok(true, "admin creates a profile");
  ok(
    (await runAs(adminId, (tx) =>
      tx`update profiles set is_active = false where id = ${newUserId}`)).count === 1,
    "admin deactivates a user"
  );
  ok(
    (await runAs(adminId, (tx) =>
      tx`update customers set deleted_at = now() where id = ${cust.id}`)).count === 1,
    "admin soft-deletes a customer"
  );
  ok(
    (await runAs(adminId, (tx) =>
      tx`update invoices set notes = 'tamper' where id = ${issuedInv}`)).count === 0,
    "admin raw UPDATE on issued invoice ALSO hits 0 rows (functions only)"
  );
  await rejects(
    runAs(adminId, (tx) => tx`update payments set amount = 1 where id = ${payment.id}`),
    /permission denied/,
    "admin payment UPDATE denied too (D-15 — no exceptions)"
  );
  await rejects(
    runAs(adminId, (tx) => tx`delete from invoice_events where invoice_id = ${issuedInv}`),
    /permission denied/,
    "admin event DELETE denied too (D-15)"
  );
}

/* ═══ R5 — deactivated user with a LIVE JWT gets nothing (R-9.3) ═══════ */
console.log("R5 — deactivated user");
{
  const view = await runAs(inactiveId, async (tx) => ({
    settings: (await tx`select * from settings`).length,
    customers: (await tx`select * from customers`).length,
    invoices: (await tx`select * from invoices`).length,
    payments: (await tx`select * from payments`).length,
    profiles: (await tx`select * from profiles`).length,
  }));
  ok(Object.values(view).every((n) => n === 0), "every SELECT returns 0 rows");
  await rejects(
    runAs(inactiveId, (tx) => tx`insert into customers (type, name) values ('walk_in', 'Ghost')`),
    /row-level security/,
    "INSERT rejected"
  );
  ok(
    (await runAs(inactiveId, (tx) => tx`update settings set company_name = 'Ghost Co'`)).count === 0,
    "UPDATE hits 0 rows"
  );
  const ghostDraft = await mkDraft();
  await rejects(
    runAs(inactiveId, (tx) => tx`select issue_invoice(${ghostDraft})`),
    /not an active user/,
    "issue_invoice() RPC rejected (SECURITY DEFINER guard)"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
