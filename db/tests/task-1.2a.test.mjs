// Task 1.2a acceptance tests — issue_invoice() + gapless numbering + §4.3 parent-lock.
// Run: pnpm test:db:1.2a  (needs .env.local; uses the SESSION pooler URL so
// held-open transactions in the lock tests behave like real sessions).
//
// DESTRUCTIVE: wipes invoice/customer/settings data. Guarded to the STAGING
// project ref only — refuses to run against anything else.
//
// Fixture rule [#28]: every amount below is derived from SCHEMA_DESIGN §3.1
// (expected values recomputed independently in JS) — never copied from the
// prototype's INV-153/151/150, which are internally wrong.

import postgres from "postgres";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_MIGRATIONS not set — run via: pnpm test:db:1.2a");
  process.exit(1);
}
if (!url.includes(STAGING_REF)) {
  console.error("Refusing to run: connection string is not the staging project.");
  process.exit(1);
}

// DNS on *.pooler.supabase.com is flaky on this machine — retry ENOTFOUND.
async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    const sql = postgres(url, { max: 12, onnotice: () => {} });
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

/* ── tiny harness ──────────────────────────────────────────────────────── */
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
function eq(actual, expected, label) {
  // bigint columns arrive as strings from the driver — coerce only when the
  // expectation is numeric, so string expectations compare as strings.
  const a = typeof expected === "number" ? Number(actual) : actual;
  ok(a === expected, `${label} (expected ${expected}, got ${a})`);
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

/* ── §3.1 expected-value oracle, independent of the SQL ────────────────── */
const RATE_BP = 500;
const halfUpVat = (qty, unitFee, rateBp = RATE_BP) =>
  Math.floor((qty * unitFee * rateBp + 5000) / 10000);

/* ── fixtures ──────────────────────────────────────────────────────────── */
const dubaiYear = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", year: "numeric" }).format(new Date())
);

async function wipe() {
  // TRUNCATE, not DELETE: since task 1.2b the delete guard and append-only
  // triggers (correctly) forbid row deletes on issued invoices, events and
  // payments. TRUNCATE fires no row triggers and we run as the table owner.
  await sql`truncate table invoice_events, payments, invoice_line_fees,
    invoice_extra_columns, invoice_lines, invoices, customers,
    invoice_counters, settings cascade`;
  await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
            values ('Staging Test Co', true, ${RATE_BP}, 'INV-{NN}')`;
}

async function mkCustomer(name = "Test Customer LLC") {
  const [c] = await sql`insert into customers (type, name, trn, address, phone)
    values ('regular', ${name}, '100000000000003', 'Deira, Dubai', '+971-50-0000000')
    returning id, name`;
  return c;
}

// lines: [{qty, govt, service}]; extras: [{label, vatable, amounts: perLineUnitAmount[]}]
async function mkDraft(customerId, lines, extras = []) {
  const [inv] = await sql`insert into invoices (customer_id) values (${customerId}) returning id`;
  const lineIds = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const [row] = await sql`insert into invoice_lines
      (invoice_id, position, description, qty, govt_fee, service_fee)
      values (${inv.id}, ${i + 1}, ${"Service line " + (i + 1)}, ${l.qty}, ${l.govt}, ${l.service})
      returning id`;
    lineIds.push(row.id);
  }
  for (let e = 0; e < extras.length; e++) {
    const x = extras[e];
    const [col] = await sql`insert into invoice_extra_columns (invoice_id, label, vatable, position)
      values (${inv.id}, ${x.label}, ${x.vatable}, ${e + 1}) returning id`;
    for (let i = 0; i < x.amounts.length; i++) {
      if (x.amounts[i] == null) continue;
      await sql`insert into invoice_line_fees (line_id, column_id, amount)
        values (${lineIds[i]}, ${col.id}, ${x.amounts[i]})`;
    }
  }
  return { id: inv.id, lineIds };
}

const issue = (id, client = sql) => client`select * from issue_invoice(${id})`;

/* ═══ T1 — happy path: totals, snapshots, number, event, counter ═══════ */
console.log("T1 — happy path calculation + sealing");
await wipe();
{
  const cust = await mkCustomer();
  const lines = [
    { qty: 2, govt: 12000, service: 3550 },
    { qty: 1, govt: 0, service: 777 }, // exact VAT 38.85 → half-up 39
    { qty: 3, govt: 500, service: 0 },
  ];
  const extras = [
    { label: "Courier", vatable: true, amounts: [1000, null, 333] }, // 49.95 → 50
    { label: "Stamp", vatable: false, amounts: [null, 2500, null] },
  ];
  const draft = await mkDraft(cust.id, lines, extras);
  const [inv] = await issue(draft.id);

  const expGovt = lines.reduce((s, l) => s + l.qty * l.govt, 0);
  const expService = lines.reduce((s, l) => s + l.qty * l.service, 0);
  const expLineVat = lines.map((l) => halfUpVat(l.qty, l.service));
  let expExtras = 0;
  let expExtraVat = 0;
  for (const x of extras)
    x.amounts.forEach((a, i) => {
      if (a == null) return;
      expExtras += lines[i].qty * a;
      if (x.vatable) expExtraVat += halfUpVat(lines[i].qty, a);
    });
  const expVat = expLineVat.reduce((s, v) => s + v, 0) + expExtraVat;

  eq(inv.status, "issued", "status sealed");
  eq(inv.subtotal_govt, expGovt, "subtotal_govt");
  eq(inv.subtotal_service, expService, "subtotal_service");
  eq(inv.subtotal_extras, expExtras, "subtotal_extras");
  eq(inv.vat_amount, expVat, "vat_amount = Σ rounded per-line (never re-rounded)");
  eq(inv.grand_total, expGovt + expService + expExtras + expVat, "grand_total");
  eq(inv.invoice_number, "INV-1", "first number INV-1");
  eq(inv.number_year, dubaiYear, "number_year = Dubai year");
  eq(inv.number_seq, 1, "number_seq 1");
  ok(inv.vat_registered_snapshot === true, "vat_registered snapshot");
  eq(inv.vat_rate_bp_snapshot, RATE_BP, "vat_rate_bp snapshot");
  ok(inv.customer_snapshot?.name === cust.name, "customer_snapshot.name frozen");
  ok(inv.issue_date != null && inv.issued_at != null, "issue_date + issued_at set");

  const frozen = await sql`select vat_amount from invoice_lines
    where invoice_id = ${draft.id} order by position`;
  expLineVat.forEach((v, i) => eq(frozen[i].vat_amount, v, `line ${i + 1} frozen vat`));

  const events = await sql`select * from invoice_events where invoice_id = ${draft.id}`;
  eq(events.length, 1, "exactly one event");
  eq(events[0].event_type, "issued", "event type 'issued'");
  const [ctr] = await sql`select last_number from invoice_counters where year = ${dubaiYear}`;
  eq(ctr.last_number, 1, "counter at 1");
}

/* ═══ T2 — §3.1 rounding boundaries ════════════════════════════════════ */
console.log("T2 — rounding: half-up at the fils boundary");
{
  const cust = await mkCustomer("Rounding Case");
  // exact VATs: 0.5 → 1 (half-up), 0.45 → 0, 1.5 → 2, 5.25 → 5
  const cases = [
    { qty: 1, service: 10, expVat: 1 },
    { qty: 1, service: 9, expVat: 0 },
    { qty: 1, service: 30, expVat: 2 },
    { qty: 7, service: 15, expVat: 5 },
  ];
  for (const c of cases) {
    const d = await mkDraft(cust.id, [{ qty: c.qty, govt: 0, service: c.service }]);
    const [inv] = await issue(d.id);
    eq(inv.vat_amount, c.expVat, `qty ${c.qty} × ${c.service} fils → VAT ${c.expVat}`);
    ok(halfUpVat(c.qty, c.service) === c.expVat, "JS oracle agrees");
  }
}

/* ═══ T3 — deregistered mode (D-16) ════════════════════════════════════ */
console.log("T3 — VAT-deregistered mode");
{
  await sql`update settings set vat_registered = false`;
  const cust = await mkCustomer("Deregistered Era");
  const d = await mkDraft(cust.id, [{ qty: 2, govt: 1000, service: 5000 }]);
  const [inv] = await issue(d.id);
  eq(inv.vat_amount, 0, "VAT 0 while deregistered");
  ok(inv.vat_registered_snapshot === false, "snapshot records deregistered");
  eq(inv.vat_rate_bp_snapshot, RATE_BP, "raw rate still snapshotted");
  eq(inv.grand_total, 2 * 1000 + 2 * 5000, "grand total without VAT");
  await sql`update settings set vat_registered = true`;
}

/* ═══ T4 — validation guards ═══════════════════════════════════════════ */
console.log("T4 — validation guards");
{
  const cust = await mkCustomer("Guards");
  const empty = await mkDraft(cust.id, []);
  await rejects(issue(empty.id), /has no lines/, "empty draft rejected");
  await rejects(
    issue("00000000-0000-0000-0000-000000000000"),
    /not found/,
    "unknown invoice rejected"
  );
  const d = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 100 }]);
  await issue(d.id);
  await rejects(issue(d.id), /not a draft/, "re-issue of issued invoice rejected");
  const neg = await mkDraft(cust.id, [{ qty: 1, govt: -5, service: 100 }]);
  await rejects(issue(neg.id), /negative unit fee/, "negative unit fee rejected");
}

/* ═══ T5 — gapless under concurrency [#21] ═════════════════════════════ */
console.log("T5 — 10 concurrent issues: no gaps, no duplicates");
await wipe();
{
  const cust = await mkCustomer("Concurrency Ten");
  const drafts = [];
  for (let i = 0; i < 10; i++)
    drafts.push(await mkDraft(cust.id, [{ qty: 1, govt: 100 * (i + 1), service: 200 * (i + 1) }]));
  const results = await Promise.all(drafts.map((d) => issue(d.id)));
  const seqs = results.map(([inv]) => Number(inv.number_seq)).sort((a, b) => a - b);
  ok(
    JSON.stringify(seqs) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    `sequences exactly 1..10 (got ${seqs.join(",")})`
  );
  const [ctr] = await sql`select last_number from invoice_counters where year = ${dubaiYear}`;
  eq(ctr.last_number, 10, "counter ends at 10");
  const [dup] = await sql`select count(*)::int as n from invoices
    group by number_year, number_seq having count(*) > 1 limit 1`.then((r) => [r[0] ?? { n: 0 }]);
  eq(dup.n, 0, "no duplicate (year,seq)");
}

/* ═══ T6 — double-click: exactly one issue ═════════════════════════════ */
console.log("T6 — concurrent confirm on the SAME draft");
{
  const cust = await mkCustomer("Double Click");
  const d = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 1000 }]);
  const [before] = await sql`select last_number from invoice_counters where year = ${dubaiYear}`;
  const settled = await Promise.allSettled([issue(d.id), issue(d.id)]);
  const wins = settled.filter((s) => s.status === "fulfilled");
  const losses = settled.filter((s) => s.status === "rejected");
  eq(wins.length, 1, "exactly one caller wins");
  eq(losses.length, 1, "exactly one caller rejected");
  ok(/not a draft/.test(String(losses[0]?.reason)), "loser sees 'not a draft'");
  const events = await sql`select count(*)::int as n from invoice_events
    where invoice_id = ${d.id} and event_type = 'issued'`;
  eq(events[0].n, 1, "exactly one 'issued' event");
  const [after] = await sql`select last_number from invoice_counters where year = ${dubaiYear}`;
  eq(after.last_number, Number(before.last_number) + 1, "counter advanced exactly once");
}

/* ═══ T7 — year boundary: fresh year starts at seq 1 [S-1] ═════════════ */
console.log("T7 — year boundary");
await wipe();
{
  await sql`insert into invoice_counters (year, last_number) values (${dubaiYear - 1}, 847)`;
  const cust = await mkCustomer("New Year");
  const d1 = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 4200 }]);
  const [inv1] = await issue(d1.id);
  eq(inv1.number_seq, 1, "first invoice of fresh year gets seq 1 (not 0, not 848)");
  eq(inv1.number_year, dubaiYear, "counter keyed to current Dubai year");
  const d2 = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 4200 }]);
  const [inv2] = await issue(d2.id);
  eq(inv2.number_seq, 2, "second invoice gets seq 2");
  const [old] = await sql`select last_number from invoice_counters where year = ${dubaiYear - 1}`;
  eq(old.last_number, 847, "previous year's counter untouched");
}

/* ═══ T8 — failed issue consumes no number (rollback, no gap) ══════════ */
console.log("T8 — failure rolls back the counter");
{
  const cust = await mkCustomer("Rollback");
  const empty = await mkDraft(cust.id, []);
  await rejects(issue(empty.id), /has no lines/, "invalid issue fails");
  const d = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 999 }]);
  const [inv] = await issue(d.id);
  eq(inv.number_seq, 3, "next successful issue is contiguous (seq 3 after T7's 2)");
}

/* ═══ T9 — edit-vs-issue race: exactly one wins (§4.3) ═════════════════ */
console.log("T9 — edit-vs-issue serialization via parent-lock");
{
  const cust = await mkCustomer("Race");
  const d = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 1000 }]);

  // Order A: edit transaction holds the parent lock; issue must BLOCK until
  // the edit commits, then recompute from the edited values (closes S-3).
  const editor = await sql.reserve();
  await editor`begin`;
  await editor`update invoice_lines set service_fee = 2000 where id = ${d.lineIds[0]}`;
  const issuing = issue(d.id);
  const raced = await Promise.race([
    issuing.then(() => "issued"),
    new Promise((r) => setTimeout(() => r("blocked"), 700)),
  ]);
  eq(raced, "blocked", "issue blocks while a draft edit is uncommitted");
  await editor`commit`;
  editor.release();
  const [inv] = await issuing;
  eq(inv.subtotal_service, 2000, "sealed totals reflect the committed edit");
  eq(inv.vat_amount, halfUpVat(1, 2000), "sealed VAT recomputed from the edit");

  // Order B: issue won — every child write on the sealed invoice now fails.
  await rejects(
    sql`update invoice_lines set service_fee = 1 where id = ${d.lineIds[0]}`,
    /frozen/,
    "post-issue line UPDATE rejected"
  );
  await rejects(
    sql`insert into invoice_lines (invoice_id, position, description, qty) values (${d.id}, 9, 'x', 1)`,
    /frozen/,
    "post-issue line INSERT rejected"
  );
  await rejects(
    sql`delete from invoice_lines where id = ${d.lineIds[0]}`,
    /frozen/,
    "post-issue line DELETE rejected"
  );
  await rejects(
    sql`insert into invoice_extra_columns (invoice_id, label, vatable, position) values (${d.id}, 'Late', true, 1)`,
    /frozen/,
    "post-issue extra-column INSERT rejected"
  );

  // Re-parenting guard: a draft's line cannot be moved onto an issued invoice.
  const d2 = await mkDraft(cust.id, [{ qty: 1, govt: 0, service: 500 }]);
  await rejects(
    sql`update invoice_lines set invoice_id = ${d.id} where id = ${d2.lineIds[0]}`,
    /frozen/,
    "re-parenting a line onto an issued invoice rejected"
  );
  // Draft children remain freely editable.
  await sql`update invoice_lines set service_fee = 600 where id = ${d2.lineIds[0]}`;
  ok(true, "draft children still editable");
  // Deleting a DRAFT invoice cascades cleanly through the trigger.
  await sql`delete from invoices where id = ${d2.id}`;
  ok(true, "draft delete cascade passes the parent-lock");
}

/* ── summary ───────────────────────────────────────────────────────────── */
console.log(`\n${passed} passed, ${failed} failed`);
await wipe(); // leave staging clean
await sql.end();
process.exit(failed === 0 ? 0 : 1);
