// Task 1.2b acceptance tests — §4.1 column-transition matrix + delete guard,
// §4.2 three-layer append-only on payments AND invoice_events.
// Run: pnpm test:db:1.2b
//
// DESTRUCTIVE: wipes invoice/customer/settings data. Guarded to STAGING only.
// Runs as the table OWNER (postgres) — the strictest possible caller: REVOKE
// and RLS do not apply to it, so every rejection asserted here is the layer-3
// trigger binding "service paths" exactly as §4.2 requires.
// Fixture rule [#28]: amounts derived from SCHEMA_DESIGN §3.1, never the prototype.

import postgres from "postgres";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url || !url.includes(STAGING_REF)) {
  console.error("Refusing to run: connection string is not the staging project.");
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
    ok(pattern.test(String(e.message ?? e)), `${label} (got: ${String(e.message).slice(0, 90)})`);
  }
}

async function wipe() {
  await sql`truncate table invoice_events, payments, invoice_line_fees,
    invoice_extra_columns, invoice_lines, invoices, customers,
    invoice_counters, settings, payment_methods cascade`;
  await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
            values ('Staging Test Co', true, 500, 'INV-{NN}')`;
}
async function mkCustomer(name) {
  const [c] = await sql`insert into customers (type, name) values ('regular', ${name})
    returning id`;
  return c.id;
}
async function mkDraft(customerId, service = 1000) {
  const [inv] = await sql`insert into invoices (customer_id) values (${customerId}) returning id`;
  await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Line', 1, 0, ${service})`;
  return inv.id;
}
const issue = async (id) => (await sql`select * from issue_invoice(${id})`)[0];

/* ═══ M1 — draft→draft edits ═══════════════════════════════════════════ */
console.log("M1 — draft→draft: whitelist only");
await wipe();
const custA = await mkCustomer("Matrix A");
const custB = await mkCustomer("Matrix B");
{
  const d = await mkDraft(custA);
  await sql`update invoices set notes = 'edited', terms = 'net 7',
    issue_date = '2026-07-01', supply_date = '2026-07-02', due_date = '2026-07-14',
    customer_id = ${custB} where id = ${d}`;
  ok(true, "whitelisted draft edits pass (customer, dates, notes, terms)");
  await rejects(
    sql`update invoices set subtotal_govt = 999 where id = ${d}`,
    /subtotal_govt.*may not change|may not change.*subtotal_govt/,
    "draft cannot receive totals"
  );
  await rejects(
    sql`update invoices set invoice_number = 'INV-99' where id = ${d}`,
    /invoice_number/,
    "draft cannot receive a number"
  );
  await rejects(
    sql`update invoices set voided_at = now(), notes = 'x' where id = ${d}`,
    /voided_at/,
    "mixed allowed+forbidden columns rejected (names the offender)"
  );
}

/* ═══ M2 — transition matrix ═══════════════════════════════════════════ */
console.log("M2 — status transitions");
{
  const d = await mkDraft(custA);
  await rejects(
    sql`update invoices set status = 'voided', void_reason = 'nope' where id = ${d}`,
    /transition 'draft' → 'voided' is not allowed/,
    "draft→voided rejected"
  );

  const inv = await issue(d);
  ok(inv.status === "issued", "issue_invoice() passes the matrix (draft→issued)");

  await rejects(
    sql`update invoices set status = 'draft' where id = ${d}`,
    /transition 'issued' → 'draft' is not allowed/,
    "issued→draft rejected (no unsealing)"
  );
  // The matrix has NO issued→issued row: every same-status UPDATE on an
  // issued invoice raises the transition error, whatever it touches.
  const frozenIssued = /transition 'issued' → 'issued' is not allowed/;
  await rejects(
    sql`update invoices set grand_total = 1 where id = ${d}`,
    frozenIssued,
    "issued financials frozen"
  );
  await rejects(
    sql`update invoices set notes = 'revised' where id = ${d}`,
    frozenIssued,
    "issued notes frozen (editable only while draft)"
  );
  await rejects(
    sql`update invoices set customer_id = ${custB} where id = ${d}`,
    frozenIssued,
    "issued customer frozen"
  );
  await rejects(
    sql`update invoices set invoice_number = 'INV-777' where id = ${d}`,
    frozenIssued,
    "issued number frozen"
  );

  // issued→voided with ONLY the void columns: allowed (shape-valid; the
  // admin-only restriction is an application/RLS concern, not the matrix's).
  const replacement = await mkDraft(custB);
  await sql`update invoices set status = 'voided', voided_at = now(),
    void_reason = 'client correction', replaces_invoice_id = ${replacement}
    where id = ${d}`;
  ok(true, "issued→voided with void columns only passes");
  await rejects(
    sql`update invoices set void_reason = 'rewrite history' where id = ${d}`,
    /transition 'voided' → 'voided' is not allowed/,
    "voided rows are terminal (no further updates)"
  );
  await rejects(
    sql`update invoices set status = 'issued' where id = ${d}`,
    /transition 'voided' → 'issued' is not allowed/,
    "voided→issued rejected"
  );

  // issued→voided must not touch money
  const d2 = await mkDraft(custA);
  await issue(d2);
  await rejects(
    sql`update invoices set status = 'voided', voided_at = now(),
      void_reason = 'x', grand_total = 0 where id = ${d2}`,
    /grand_total/,
    "void that also edits financials rejected"
  );
}

/* ═══ M3 — delete guard ════════════════════════════════════════════════ */
console.log("M3 — BEFORE DELETE: drafts only");
{
  const draft = await mkDraft(custA);
  const issued = await mkDraft(custA);
  await issue(issued);
  const voided = await mkDraft(custA);
  await issue(voided);
  await sql`update invoices set status = 'voided', voided_at = now(), void_reason = 'v'
    where id = ${voided}`;

  await rejects(
    sql`delete from invoices where id = ${issued}`,
    /issued invoice .* cannot be deleted/,
    "issued delete rejected"
  );
  await rejects(
    sql`delete from invoices where id = ${voided}`,
    /voided invoice .* cannot be deleted/,
    "voided delete rejected"
  );
  await sql`delete from invoices where id = ${draft}`;
  const gone = await sql`select 1 from invoice_lines where invoice_id = ${draft}`;
  ok(gone.length === 0, "draft delete passes and cascades to children");
}

/* ═══ M4 — §4.2 append-only (owner = service-path-strength caller) ═════ */
console.log("M4 — payments & invoice_events append-only");
{
  const [method] = await sql`insert into payment_methods (label) values ('Cash')
    returning id`;
  const d = await mkDraft(custA, 20000);
  await issue(d);
  const [pay] = await sql`insert into payments (invoice_id, amount, method_id, received_on)
    values (${d}, 10000, ${method.id}, current_date) returning id`;
  ok(!!pay.id, "payment INSERT allowed");
  await sql`insert into invoice_events (invoice_id, event_type, payload)
    values (${d}, 'payment_recorded', '{}')`;
  ok(true, "event INSERT allowed");

  await rejects(
    sql`update payments set amount = 99999 where id = ${pay.id}`,
    /payments: append-only — UPDATE is never permitted/,
    "payment UPDATE rejected even for the table owner"
  );
  await rejects(
    sql`delete from payments where id = ${pay.id}`,
    /payments: append-only — DELETE is never permitted/,
    "payment DELETE rejected even for the table owner"
  );
  await rejects(
    sql`update invoice_events set payload = '{"forged":true}' where invoice_id = ${d}`,
    /invoice_events: append-only — UPDATE is never permitted/,
    "event UPDATE rejected even for the table owner"
  );
  await rejects(
    sql`delete from invoice_events where invoice_id = ${d}`,
    /invoice_events: append-only — DELETE is never permitted/,
    "event DELETE rejected even for the table owner"
  );

  // Reversal is an INSERT, never an UPDATE (D-14/[#6]).
  await sql`insert into payments (invoice_id, amount, method_id, received_on, reverses_payment_id)
    values (${d}, -10000, ${method.id}, current_date, ${pay.id})`;
  ok(true, "reversal row (negative INSERT) allowed");

  // Layers 1+2: privileges revoked and RLS enabled for the app roles.
  const [priv] = await sql`select
    has_table_privilege('authenticated', 'public.payments', 'UPDATE') as pu,
    has_table_privilege('authenticated', 'public.payments', 'DELETE') as pd,
    has_table_privilege('authenticated', 'public.invoice_events', 'UPDATE') as eu,
    has_table_privilege('authenticated', 'public.invoice_events', 'DELETE') as ed,
    has_table_privilege('anon', 'public.payments', 'UPDATE') as apu,
    has_table_privilege('anon', 'public.invoice_events', 'DELETE') as aed`;
  ok(
    !priv.pu && !priv.pd && !priv.eu && !priv.ed && !priv.apu && !priv.aed,
    "layer 1: UPDATE/DELETE revoked from anon + authenticated"
  );
  const rls = await sql`select relname, relrowsecurity from pg_class
    where relname in ('payments','invoice_events')`;
  ok(
    rls.length === 2 && rls.every((r) => r.relrowsecurity === true),
    "layer 2: RLS enabled on both tables (policies land in 1.3)"
  );
  const pol = await sql`select count(*)::int as n from pg_policies
    where tablename in ('payments','invoice_events') and cmd in ('UPDATE','DELETE')`;
  ok(pol[0].n === 0, "layer 2: no UPDATE/DELETE policy exists for any role");
}

/* ═══ M5 — regression: 1.2a behavior intact under the new triggers ═════ */
console.log("M5 — issue flow + parent-lock regression");
{
  const d = await mkDraft(custB, 777); // exact VAT 38.85 → half-up 39
  const inv = await issue(d);
  ok(
    Number(inv.vat_amount) === 39 && Number(inv.grand_total) === 816,
    "issue_invoice() still seals correctly through the matrix trigger"
  );
  await rejects(
    sql`update invoice_lines set service_fee = 1 where invoice_id = ${d}`,
    /frozen/,
    "§4.3 parent-lock still guards children"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
await wipe();
await sql.end();
process.exit(failed === 0 ? 0 : 1);
