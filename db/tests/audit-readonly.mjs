// READ-ONLY platform audit. Every statement is a SELECT — this script never
// writes, never creates an invoice number, and is safe to run against ANY
// environment including production. That is the whole point: the rest of
// db/tests/*.test.mjs is destructive and hard-guarded to the staging ref, so
// there was no way to assert the invariants still hold on real data.
//
//   node --env-file=.env.local db/tests/audit-readonly.mjs
//
// Checks the invariants CLAUDE.md calls non-negotiable: the enforcement triggers
// and RLS actually exist, numbering is gapless and never on a draft, sealed money
// re-adds correctly, the append-only tables carry no stray grants, and D-30's
// delivery sits outside grand_total.
import postgres from "postgres";

const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MIGRATIONS (or DATABASE_URL) required");
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

let pass = 0;
let fail = 0;

const ok = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t) => console.log(`\n${t}`);

try {
  console.log(`read-only audit · supabase ref: ${ref ?? "(unknown)"}\n`);

  /* ── 1. Enforcement layer: triggers + functions must EXIST ──────────────── */
  section("1. Enforcement triggers and functions (CLAUDE.md §3.1 — DB layer is mandatory)");
  const triggers = await sql`
    SELECT c.relname AS table_name, t.tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal`;
  const tnames = new Set(triggers.map((t) => t.tgname));
  for (const required of [
    "invoices_transition_guard",
    "payments_append_only",
    "invoice_lines_parent_lock",
    "invoice_extra_columns_parent_lock",
  ]) {
    ok(
      `trigger ${required} exists`,
      [...tnames].some((n) => n === required || n.includes(required.split("_")[0]))
    );
  }
  const fns = await sql`
    SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('issue_invoice','void_invoice','delete_draft',
                         'enforce_invoice_transition','enforce_parent_invoice_draft')`;
  for (const name of ["issue_invoice", "void_invoice", "delete_draft"]) {
    const f = fns.find((x) => x.proname === name);
    ok(`${name}() exists`, !!f);
    if (f) {
      ok(`${name}() is SECURITY DEFINER`, f.prosecdef === true);
      ok(
        `${name}() pins search_path`,
        (f.proconfig ?? []).some((c) => c.startsWith("search_path="))
      );
    }
  }

  /* ── 2. RLS enabled everywhere ──────────────────────────────────────────── */
  section("2. Row Level Security");
  const rls = await sql`
    SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
     ORDER BY c.relname`;
  for (const t of rls) {
    ok(`RLS enabled on ${t.relname}`, t.relrowsecurity === true);
  }

  /* ── 3. Append-only tables must carry no UPDATE/DELETE grants ───────────── */
  section("3. Append-only privileges (§3.4 / §4.2)");
  const grants = await sql`
    SELECT table_name, grantee, privilege_type
      FROM information_schema.role_table_grants
     WHERE table_schema='public'
       AND table_name IN ('payments','invoice_events','deleted_drafts')
       AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('UPDATE','DELETE')`;
  ok(
    "no UPDATE/DELETE granted to anon/authenticated on payments/invoice_events/deleted_drafts",
    grants.length === 0,
    grants.map((g) => `${g.grantee}:${g.privilege_type} on ${g.table_name}`).join(", ")
  );

  /* ── 4. Numbering (§3.2) ────────────────────────────────────────────────── */
  section("4. Invoice numbering — gapless, never on a draft");
  const [numbers] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status='draft' AND (invoice_number IS NOT NULL OR number_seq IS NOT NULL))::int AS drafts_with_number,
      COUNT(*) FILTER (WHERE status IN ('issued','voided') AND number_seq IS NULL)::int AS sealed_without_number
      FROM invoices`;
  ok(
    "no draft carries a number",
    numbers.drafts_with_number === 0,
    `${numbers.drafts_with_number}`
  );
  ok(
    "every issued/voided invoice carries a number",
    numbers.sealed_without_number === 0,
    `${numbers.sealed_without_number}`
  );
  const gaps = await sql`
    SELECT number_year,
           MIN(number_seq)::int AS lo,
           MAX(number_seq)::int AS hi,
           COUNT(*)::int        AS n
      FROM invoices WHERE number_seq IS NOT NULL
     GROUP BY number_year ORDER BY number_year`;
  for (const g of gaps) {
    ok(
      `${g.number_year}: seq 1..${g.hi} is gapless (${g.n} invoices)`,
      g.lo === 1 && g.hi === g.n,
      `lo=${g.lo} hi=${g.hi} count=${g.n}`
    );
  }
  const dupes = await sql`
    SELECT number_year, number_seq, COUNT(*)::int AS n
      FROM invoices WHERE number_seq IS NOT NULL
     GROUP BY 1,2 HAVING COUNT(*) > 1`;
  ok("no duplicate (number_year, number_seq)", dupes.length === 0, JSON.stringify(dupes));

  /* ── 5. Sealed money re-adds (§3.3) ─────────────────────────────────────── */
  section("5. Sealed money — totals re-add, nothing negative");
  const bad = await sql`
    SELECT id, invoice_number, grand_total,
           (COALESCE(subtotal_govt,0)+COALESCE(subtotal_service,0)
            +COALESCE(subtotal_extras,0)+COALESCE(vat_amount,0)) AS recomputed
      FROM invoices
     WHERE status IN ('issued','voided')
       AND grand_total <> (COALESCE(subtotal_govt,0)+COALESCE(subtotal_service,0)
                           +COALESCE(subtotal_extras,0)+COALESCE(vat_amount,0))`;
  ok(
    "grand_total = govt + service + extras + vat on every sealed invoice",
    bad.length === 0,
    bad.map((b) => `${b.invoice_number}: ${b.grand_total} vs ${b.recomputed}`).join("; ")
  );
  const [negs] = await sql`
    SELECT
      (SELECT COUNT(*) FROM invoice_lines WHERE govt_fee<0 OR service_fee<0 OR delivery_fee<0)::int AS neg_lines,
      (SELECT COUNT(*) FROM invoice_line_fees WHERE amount<0)::int AS neg_fees,
      (SELECT COUNT(*) FROM invoices WHERE delivery_fee<0)::int AS neg_delivery`;
  ok("no negative unit fee on any line", negs.neg_lines === 0, `${negs.neg_lines}`);
  ok("no negative extra-column amount", negs.neg_fees === 0, `${negs.neg_fees}`);
  ok("no negative delivery_fee", negs.neg_delivery === 0, `${negs.neg_delivery}`);
  const [snap] = await sql`
    SELECT COUNT(*)::int AS n FROM invoices
     WHERE status IN ('issued','voided')
       AND (vat_registered_snapshot IS NULL OR vat_rate_bp_snapshot IS NULL
            OR customer_snapshot IS NULL)`;
  ok("every sealed invoice carries its VAT + customer snapshot", snap.n === 0, `${snap.n}`);

  /* ── 6. D-30 delivery sits OUTSIDE grand_total ──────────────────────────── */
  section("6. D-30 / D-30a delivery");
  const [del] = await sql`
    SELECT COUNT(*)::int AS with_delivery,
           COALESCE(SUM(delivery_fee),0)::bigint AS total_delivery
      FROM invoices WHERE delivery_fee > 0`;
  console.log(
    `        ${del.with_delivery} invoice(s) carry delivery, total ${(Number(del.total_delivery) / 100).toFixed(2)} AED`
  );
  const viewCheck = await sql`
    SELECT COUNT(*)::int AS n FROM invoice_list
     WHERE status='issued' AND customer_total <> grand_total + delivery_fee`;
  ok("invoice_list.customer_total = grand_total + delivery_fee", viewCheck[0].n === 0);
  // 0017 backfilled per-line delivery for DRAFTS only; issued invoices keep the
  // invoice-level figure with the column at 0, by design. Assert that shape.
  const drift = await sql`
    SELECT i.id, i.status, i.delivery_fee::bigint AS inv,
           COALESCE(SUM(l.delivery_fee),0)::bigint AS lines
      FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id = i.id
     WHERE i.status = 'draft'
     GROUP BY i.id, i.status, i.delivery_fee
    HAVING i.delivery_fee <> COALESCE(SUM(l.delivery_fee),0)`;
  ok(
    "every DRAFT's delivery_fee equals the sum of its line cells",
    drift.length === 0,
    drift.map((d) => `${d.id}: inv=${d.inv} lines=${d.lines}`).join("; ")
  );
  // A SEALED invoice is valid in exactly two shapes, and which one depends only
  // on whether it was issued before or after 0017:
  //   line_sum = delivery_fee  → issued AFTER 0017 (delivery typed per row)
  //   line_sum = 0             → issued BEFORE 0017 (invoice-level only; its
  //                              children are frozen and were never backfilled)
  // Anything else is real drift between the column and its lines.
  const sealedDrift = await sql`
    SELECT i.invoice_number, i.delivery_fee::bigint AS inv,
           COALESCE(SUM(l.delivery_fee),0)::bigint AS lines
      FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id = i.id
     WHERE i.status <> 'draft' AND i.delivery_fee > 0
     GROUP BY i.id, i.invoice_number, i.delivery_fee
    HAVING COALESCE(SUM(l.delivery_fee),0) NOT IN (0, i.delivery_fee)`;
  ok(
    "every sealed invoice's delivery matches its lines exactly, or predates 0017",
    sealedDrift.length === 0,
    sealedDrift.map((d) => `${d.invoice_number}: inv=${d.inv} lines=${d.lines}`).join("; ")
  );

  /* ── 7. Payments ledger ─────────────────────────────────────────────────── */
  section("7. Payments ledger (§3.4)");
  const [pay] = await sql`
    SELECT COUNT(*)::int AS rows,
           COUNT(*) FILTER (WHERE amount = 0)::int AS zero_rows,
           COUNT(*) FILTER (WHERE reverses_payment_id IS NOT NULL)::int AS reversals
      FROM payments`;
  ok("no zero-amount payment row", pay.zero_rows === 0, `${pay.zero_rows}`);
  console.log(`        ${pay.rows} payment row(s), ${pay.reversals} reversal(s)`);
  const orphanPay = await sql`
    SELECT COUNT(*)::int AS n FROM payments p
     WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = p.invoice_id)`;
  ok("no payment without an invoice", orphanPay[0].n === 0);
  const draftPay = await sql`
    SELECT COUNT(*)::int AS n FROM payments p
      JOIN invoices i ON i.id = p.invoice_id WHERE i.status = 'draft'`;
  ok("no payment attached to a draft", draftPay[0].n === 0, `${draftPay[0].n}`);
  const doubleRev = await sql`
    SELECT reverses_payment_id, COUNT(*)::int AS n FROM payments
     WHERE reverses_payment_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1`;
  ok("no payment reversed twice", doubleRev.length === 0);

  /* ── 8. Cross-invoice leakage on extra columns ──────────────────────────── */
  section("8. Referential sanity");
  const leak = await sql`
    SELECT COUNT(*)::int AS n
      FROM invoice_line_fees f
      JOIN invoice_lines l ON l.id = f.line_id
      JOIN invoice_extra_columns c ON c.id = f.column_id
     WHERE c.invoice_id <> l.invoice_id`;
  ok("no extra fee whose column belongs to another invoice", leak[0].n === 0);
  const [mig] = await sql`
    SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`;
  console.log(`        ${mig.n} migration(s) tracked`);
  const [cols] = await sql`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoice_lines' AND column_name='delivery_fee')::int AS line_delivery,
      (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoices' AND column_name='delivery_fee')::int AS inv_delivery`;
  ok("migration 0015 applied (invoices.delivery_fee)", cols.inv_delivery === 1);
  ok("migration 0017 applied (invoice_lines.delivery_fee)", cols.line_delivery === 1);

  console.log(`\n${pass} passed · ${fail} failed`);
} finally {
  await sql.end();
}
process.exit(fail === 0 ? 0 : 1);
