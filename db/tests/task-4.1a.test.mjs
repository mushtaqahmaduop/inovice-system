// Task 4.1a acceptance tests — live-totals calc mirror (§3.1).
// Run: pnpm test:db:4.1a   (no next server needed)
//
// Two halves:
//  A) Oracle cases for lib/invoice-calc.ts (compiled on the fly with tsc):
//     integer half-up per component, qty multiplies BEFORE rounding,
//     deregistered → 0 VAT, extras vatable/non-vatable split.
//  B) Ground truth: build the same invoice in staging, seal it through
//     issue_invoice(), and require the TS mirror to agree with every
//     sealed total to the fils. DESTRUCTIVE (truncates invoice tables).

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const STAGING_REF = "kxtbxgcvwxvlsoygjvvi";
const dbUrl = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!dbUrl?.includes(STAGING_REF)) {
  console.error("Refusing to run: not the staging project.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));
const eq = (a, b, l) => ok(Number(a) === Number(b), `${l} (expected ${b}, got ${a})`);

/* ── compile the TS module and import it ───────────────────────────────── */
console.log("setup — compile lib/invoice-calc.ts");
const outDir = mkdtempSync(join(tmpdir(), "invcalc-"));
// node_modules path directly — `pnpm exec` would route through the broken
// global pnpm on this machine (FINDINGS.md).
execSync(
  `node node_modules/typescript/lib/tsc.js lib/invoice-calc.ts --target es2022 --module es2022 --moduleResolution bundler --outDir "${outDir}"`,
  { stdio: "inherit" }
);
writeFileSync(join(outDir, "package.json"), '{"type":"module"}');
const { calcInvoiceTotals, toRoman } = await import(
  pathToFileURL(join(outDir, "invoice-calc.js")).href
);

/* ═══ A — oracle cases ════════════════════════════════════════════════════ */
console.log("A — §3.1 oracle");
{
  const opts = { vatRegistered: true, vatRateBp: 500 };
  const line = (qty, govt, service, extraFees = {}) => ({
    description: "x",
    qty,
    govtFee: govt,
    serviceFee: service,
    extraFees,
  });

  const t1 = calcInvoiceTotals([line(1, 20000, 10000)], [], opts);
  eq(t1.vatAmount, 500, "5% of 10000 fils service fee");
  eq(t1.subtotalGovt, 20000, "govt passthrough untouched");
  eq(t1.grandTotal, 30500, "grand = govt + service + vat");

  // Half-up: 110 fils at 5% = 5.5 → 6; 105 fils = 5.25 → 5.
  eq(calcInvoiceTotals([line(1, 0, 110)], [], opts).vatAmount, 6, "5.5 fils rounds UP (half-up)");
  eq(calcInvoiceTotals([line(1, 0, 105)], [], opts).vatAmount, 5, "5.25 fils rounds DOWN");

  // qty multiplies BEFORE rounding: 3 × 110 = 330 → 16.5 → 17 (not 3×6=18).
  eq(
    calcInvoiceTotals([line(3, 0, 110)], [], opts).vatAmount,
    17,
    "qty × unit before rounding (line-item basis)"
  );

  // Per-LINE rounding, summed — never re-rounded from the subtotal.
  const two = calcInvoiceTotals([line(1, 0, 110), line(1, 0, 110)], [], opts);
  eq(two.vatAmount, 12, "two lines round independently (6+6, not round(11))");

  // Extra columns: vatable taxed per cell, non-vatable never.
  const cols = [
    { id: "c1", label: "Courier", vatable: true },
    { id: "c2", label: "Stamp", vatable: false },
  ];
  const t3 = calcInvoiceTotals([line(2, 0, 0, { c1: 110, c2: 5000 })], cols, opts);
  eq(t3.extrasVatable, 220, "vatable extra: qty × unit");
  eq(t3.extrasNonVatable, 10000, "non-vatable extra summed separately");
  eq(t3.vatAmount, 11, "cell VAT: 2×110 at 5% = 11 (16.5→17 shape avoided per cell)");
  eq(t3.subtotalExtras, 10220, "subtotal_extras = vatable + non-vatable (matches SQL)");

  // Deregistered → rate 0 everywhere.
  const off = calcInvoiceTotals([line(1, 20000, 10000, { c1: 110 })], cols, {
    vatRegistered: false,
    vatRateBp: 500,
  });
  eq(off.vatAmount, 0, "deregistered: zero VAT");
  eq(off.grandTotal, 30110, "deregistered grand total has no VAT");

  // Empty invoice.
  eq(calcInvoiceTotals([], [], opts).grandTotal, 0, "empty invoice totals 0");

  ok(toRoman(1) === "I" && toRoman(4) === "IV" && toRoman(28) === "XXVIII", "roman indices");
}

/* ═══ B — ground truth against issue_invoice() ════════════════════════════ */
console.log("B — cross-check vs issue_invoice() on staging");
const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
{
  await sql`truncate table invoice_events, payments, invoice_line_fees,
    invoice_extra_columns, invoice_lines, invoices, customers,
    invoice_counters, settings cascade`;
  await sql`insert into settings (company_name, vat_registered, vat_rate_bp, invoice_number_format)
            values ('Calc Xcheck Co', true, 500, 'INV-{NN}')`;

  const [cust] =
    await sql`insert into customers (type, name) values ('walk_in', 'Xcheck') returning id`;
  const [inv] = await sql`insert into invoices (customer_id) values (${cust.id}) returning id`;
  // Awkward numbers on purpose: qty 3 × 110 exercises the half-up kernel.
  const [l1] =
    await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 1, 'Attestation', 3, 12345, 110) returning id`;
  const [l2] =
    await sql`insert into invoice_lines (invoice_id, position, description, qty, govt_fee, service_fee)
    values (${inv.id}, 2, 'Typing', 1, 0, 10105) returning id`;
  const [colV] = await sql`insert into invoice_extra_columns (invoice_id, label, vatable, position)
    values (${inv.id}, 'Courier', true, 1) returning id`;
  const [colN] = await sql`insert into invoice_extra_columns (invoice_id, label, vatable, position)
    values (${inv.id}, 'Stamp', false, 2) returning id`;
  await sql`insert into invoice_line_fees (line_id, column_id, amount) values
    (${l1.id}, ${colV.id}, 210), (${l2.id}, ${colN.id}, 7500)`;

  const [sealed] = await sql`select * from issue_invoice(${inv.id})`;

  const mirror = calcInvoiceTotals(
    [
      {
        description: "Attestation",
        qty: 3,
        govtFee: 12345,
        serviceFee: 110,
        extraFees: { v: 210 },
      },
      { description: "Typing", qty: 1, govtFee: 0, serviceFee: 10105, extraFees: { n: 7500 } },
    ],
    [
      { id: "v", label: "Courier", vatable: true },
      { id: "n", label: "Stamp", vatable: false },
    ],
    { vatRegistered: true, vatRateBp: 500 }
  );

  eq(sealed.subtotal_govt, mirror.subtotalGovt, "subtotal_govt agrees");
  eq(sealed.subtotal_service, mirror.subtotalService, "subtotal_service agrees");
  eq(sealed.subtotal_extras, mirror.subtotalExtras, "subtotal_extras agrees");
  eq(sealed.vat_amount, mirror.vatAmount, "vat_amount agrees TO THE FILS");
  eq(sealed.grand_total, mirror.grandTotal, "grand_total agrees");
}

console.log(`\n${passed} passed, ${failed} failed`);
await sql.end();
process.exit(failed === 0 ? 0 : 1);
