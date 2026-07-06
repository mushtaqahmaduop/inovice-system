// Live-totals calculation (task 4.1a) — a DISPLAY-ONLY mirror of the math
// inside issue_invoice() (migration 0005/0007). The server NEVER trusts
// these numbers: sealing recomputes everything in SQL (CLAUDE.md §3.1/§4).
// Keep this file dependency-free and byte-faithful to the SQL:
//   per vatable component: vat = (qty * unit_fee * rate_bp + 5000) DIV 10000
// — integer half-up per line/cell (§3.1), summed, never re-rounded.

export type ExtraColumn = {
  id: string; // client-side id while drafting; DB id once persisted
  label: string;
  vatable: boolean;
};

export type DraftLine = {
  description: string;
  qty: number; // integer ≥ 1
  govtFee: number; // UNIT fils, 0% VAT passthrough
  serviceFee: number; // UNIT fils, VATable
  /** UNIT fils per extra column id; missing = 0 */
  extraFees: Record<string, number>;
};

export type InvoiceTotals = {
  subtotalGovt: number;
  subtotalService: number;
  subtotalExtras: number; // vatable + non-vatable together (matches the SQL)
  extrasVatable: number; // display split only
  extrasNonVatable: number;
  vatAmount: number;
  grandTotal: number;
};

// Integer half-up VAT for one component — the (x + 5000) DIV 10000 kernel.
function componentVat(qty: number, unitFils: number, rateBp: number): number {
  return Math.floor((qty * unitFils * rateBp + 5000) / 10000);
}

export function calcInvoiceTotals(
  lines: DraftLine[],
  columns: ExtraColumn[],
  opts: { vatRegistered: boolean; vatRateBp: number }
): InvoiceTotals {
  const rate = opts.vatRegistered ? opts.vatRateBp : 0; // v_rate in the SQL

  let subtotalGovt = 0;
  let subtotalService = 0;
  let extrasVatable = 0;
  let extrasNonVatable = 0;
  let vat = 0;

  for (const line of lines) {
    subtotalGovt += line.qty * line.govtFee;
    subtotalService += line.qty * line.serviceFee;
    vat += componentVat(line.qty, line.serviceFee, rate);
    for (const col of columns) {
      const unit = line.extraFees[col.id] ?? 0;
      if (unit === 0) continue;
      if (col.vatable) {
        extrasVatable += line.qty * unit;
        vat += componentVat(line.qty, unit, rate);
      } else {
        extrasNonVatable += line.qty * unit;
      }
    }
  }

  const subtotalExtras = extrasVatable + extrasNonVatable;
  return {
    subtotalGovt,
    subtotalService,
    subtotalExtras,
    extrasVatable,
    extrasNonVatable,
    vatAmount: vat,
    grandTotal: subtotalGovt + subtotalService + subtotalExtras + vat,
  };
}

// Roman numeral row indices — an editorial detail from the approved
// prototype (CLAUDE.md §5).
const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function toRoman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out || "—";
}
