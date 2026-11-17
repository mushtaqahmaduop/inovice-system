// Customer-copy line amounts (D-30 / D-30a) — pure math, no DB, no server.
// Run: pnpm test:customer-lines
//
// Guards the owner-reported defect of 2026-07-31: the editor grid showed
// 353.00 / 457.00 on a two-line invoice with 53 / 57 delivery, but the issued
// customer copy printed 347.14 / 462.86. The total was right, so it looked
// fine until you read the lines — the copy was pro-rating the invoice-level
// delivery by net weight instead of charging each row its own figure.
//
// Fils throughout (AED × 100).

// lib/invoice-calc.ts is deliberately dependency-free, so the whole module
// compiles standalone. Node 20 cannot import .ts, and this repo has no test
// runner — so shell out to the TypeScript already in devDependencies and
// import the emitted JS. No new dependency, and the test exercises the SAME
// source the customer copy renders from.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "node_modules", ".cache", "invoice-calc-test");
mkdirSync(outDir, { recursive: true });
// Invoke tsc's own entrypoint with node rather than the .cmd/bin shim —
// spawning a .cmd without a shell is EINVAL on Windows.
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "typescript", "lib", "tsc.js"),
    path.join(root, "lib", "invoice-calc.ts"),
    "--outDir",
    outDir,
    "--module",
    "esnext",
    "--target",
    "es2022",
    "--moduleResolution",
    "bundler",
  ],
  { stdio: "inherit", cwd: root }
);
const { calcCustomerLineAmounts } = await import(
  pathToFileURL(path.join(outDir, "invoice-calc.js")).href
);

let passed = 0;
let failed = 0;
const ok = (c, l) =>
  c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.error(`  ✗ ${l}`));
const eq = (got, want, l) =>
  ok(JSON.stringify(got) === JSON.stringify(want), `${l} — got ${JSON.stringify(got)}`);

const line = (govt, service, delivery, qty = 1, extraFees = []) => ({
  qty,
  govtFee: govt,
  serviceFee: service,
  extraFees,
  deliveryFee: delivery,
});
const sum = (a) => a.reduce((s, v) => s + v, 0);

// ── The reported case, exactly ──────────────────────────────────────────────
// rent:        govt 200.00 + service 100.00 + delivery 53.00 = 353.00
// visa renewal: govt 200.00 + service 200.00 + delivery 57.00 = 457.00
// Not VAT-registered, so grand_total = 700.00 and delivery = 110.00.
console.log("owner report 2026-07-31 — per-line delivery, no VAT");
{
  const lines = [line(20000, 10000, 5300), line(20000, 20000, 5700)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 70000,
    deliveryFee: 11000,
  });
  eq(got, [35300, 45700], "lines match the editor grid (353.00 / 457.00)");
  ok(got[0] !== 34714 && got[1] !== 46286, "the pro-rated figures 347.14 / 462.86 are gone");
  ok(sum(got) === 81000, "lines still foot to the customer total 810.00");
}

// ── VAT-registered: sealed VAT spreads, delivery still charged as entered ───
console.log("VAT-registered — VAT spreads, delivery does not");
{
  // service 100.00 and 200.00 at 5% → VAT 5.00 + 10.00 = 15.00.
  const lines = [line(20000, 10000, 5300), line(20000, 20000, 5700)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: true,
    vatAmount: 1500,
    grandTotal: 71500,
    deliveryFee: 11000,
  });
  // 300.00 + 5.00 + 53.00 = 358.00   |   400.00 + 10.00 + 57.00 = 467.00
  eq(got, [35800, 46700], "each line = net + its own VAT + its own delivery");
  ok(sum(got) === 71500 + 11000, "lines foot to grand_total + delivery");
}

// ── Legacy pre-0017 invoices: delivery lived only on the invoice ────────────
console.log("pre-0017 sealed invoice — invoice-level delivery still spreads");
{
  const lines = [line(20000, 10000, 0), line(20000, 20000, 0)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 70000,
    deliveryFee: 11000,
  });
  eq(got, [34714, 46286], "unchanged: reprints exactly what the customer was handed");
  ok(sum(got) === 81000, "still foots to the customer total");
}

// ── Delivery on one row only ────────────────────────────────────────────────
console.log("delivery attributed to a single row");
{
  const lines = [line(20000, 10000, 11000), line(20000, 20000, 0)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 70000,
    deliveryFee: 11000,
  });
  eq(got, [41000, 40000], "the whole fee sits on the row that incurred it");
}

// ── D-30a: a driver's fee is flat, never multiplied by qty ──────────────────
console.log("qty > 1 — delivery is a ROW total, not a unit fee");
{
  const lines = [line(20000, 10000, 5000, 3)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 90000,
    deliveryFee: 5000,
  });
  eq(got, [95000], "3 × 300.00 + 50.00 delivery, not 3 × 50.00");
}

// ── No delivery at all ──────────────────────────────────────────────────────
console.log("no delivery");
{
  const lines = [line(20000, 10000, 0), line(20000, 20000, 0)];
  const got = calcCustomerLineAmounts(lines, [], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 70000,
    deliveryFee: 0,
  });
  eq(got, [30000, 40000], "plain net amounts");
}

// ── Extra columns are still folded into the net ─────────────────────────────
console.log("extra fee columns");
{
  const lines = [line(20000, 10000, 5300, 1, [2500]), line(20000, 20000, 5700, 1, [0])];
  const got = calcCustomerLineAmounts(lines, [{ vatable: false }], {
    vatRegistered: false,
    vatAmount: 0,
    grandTotal: 72500,
    deliveryFee: 11000,
  });
  eq(got, [37800, 45700], "extras ride in the net, delivery stays per row");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
