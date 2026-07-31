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

// Per-line VAT, same kernel and same order of operations as calcInvoiceTotals
// below (and therefore as the SQL): service fee + every VAT-able extra column,
// each rounded on its own before being added. Display only — the editor shows
// it as a read-only column; the sealed figure is written by issue_invoice().
export function calcLineVat(
  line: DraftLine,
  columns: ExtraColumn[],
  opts: { vatRegistered: boolean; vatRateBp: number }
): number {
  const rate = opts.vatRegistered ? opts.vatRateBp : 0;
  if (rate === 0) return 0;
  let vat = componentVat(line.qty, line.serviceFee, rate);
  for (const col of columns) {
    if (!col.vatable) continue;
    const unit = line.extraFees[col.id] ?? 0;
    if (unit === 0) continue;
    vat += componentVat(line.qty, unit, rate);
  }
  return vat;
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

// ── Customer-copy line amounts (D-30) ───────────────────────────────────────
// The customer copy hides the govt/service split and the VAT row, printing ONE
// blended amount per line. This derives those amounts. It is a DISPLAY layer
// only (cf. D-27 foreign currency): no sealed money is recomputed or altered,
// the parts are just redistributed so the printed lines foot EXACTLY to the
// printed total — hiding the VAT row must not leave a visible gap that would
// leak the service fee.

export type CustomerCopyLine = {
  qty: number;
  govtFee: number; // UNIT fils
  serviceFee: number; // UNIT fils
  extraFees: number[]; // UNIT fils, by column index
  /** D-30a ROW TOTAL fils, never × qty. Undefined/0 on pre-0017 invoices. */
  deliveryFee?: number;
};

/** Spread `amount` across `weights` in integer fils, largest-remainder, so the
 *  parts sum back to `amount` exactly. Null when there is nothing to spread. */
function spread(amount: number, weights: number[]): number[] | null {
  const totalWeight = weights.reduce((s, v) => s + v, 0);
  if (amount <= 0 || totalWeight <= 0) return null;
  const raw = weights.map((w) => (amount * w) / totalWeight);
  const share = raw.map((r) => Math.floor(r));
  let leftover = amount - share.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) share[order[k].i] += 1;
  return share;
}

/** Net (pre-VAT, pre-delivery) blended amount for one line: the figure the FTA
 *  copy prints in its Amount column. */
export function customerLineNet(l: CustomerCopyLine): number {
  return l.qty * (l.govtFee + l.serviceFee + l.extraFees.reduce((s, v) => s + v, 0));
}

export function calcCustomerLineAmounts(
  lines: CustomerCopyLine[],
  columns: { vatable: boolean }[],
  opts: { vatRegistered: boolean; vatAmount: number; grandTotal: number; deliveryFee: number }
): number[] {
  const nets = lines.map(customerLineNet);
  const out = nets.slice();
  const delivery = Math.max(0, opts.deliveryFee);

  // Sealed VAT, distributed proportional to each line's VAT-able base.
  const vat = opts.vatRegistered ? opts.vatAmount : 0;
  if (vat > 0 && nets.length > 0) {
    const base = (l: CustomerCopyLine) =>
      l.qty *
      (l.serviceFee + l.extraFees.reduce((s, v, i) => s + (columns[i]?.vatable ? v : 0), 0));
    const share = spread(vat, lines.map(base));
    if (share) for (let i = 0; i < out.length; i++) out[i] += share[i];
  }

  // Delivery (D-30) rides inside the line amounts, so it never appears as a
  // nameable row the FTA copy would have to explain.
  //
  // Since 0017 delivery is entered PER LINE, so each row carries its own figure
  // and must be charged exactly that: the editor grid shows
  // qty×(govt+service+extras) + that row's delivery, and the customer copy has
  // to agree line for line. Pro-rating the invoice-level total by net weight
  // instead (the pre-0017 rule) silently rewrote every amount — a 53/57 split
  // across two rows printed as 47.14/62.86: right total, wrong lines (owner
  // report 2026-07-31).
  //
  // Pre-0017 invoices sealed delivery only at invoice level with the line
  // column at 0. Those are immutable and must keep printing exactly what the
  // customer was handed, so they still spread proportionally. The per-line
  // figures are authoritative only when they account for the whole fee.
  if (delivery > 0 && nets.length > 0) {
    const perLine = lines.map((l) => Math.max(0, l.deliveryFee ?? 0));
    const perLineTotal = perLine.reduce((s, v) => s + v, 0);
    const share = perLineTotal === delivery ? perLine : spread(delivery, nets);
    if (share) for (let i = 0; i < out.length; i++) out[i] += share[i];
  }

  // Absorb any residual (e.g. seal rounding) into the last line so the copy
  // always foots to the exact figure printed as its total.
  const delta = opts.grandTotal + delivery - out.reduce((s, v) => s + v, 0);
  if (delta !== 0 && out.length > 0) out[out.length - 1] += delta;
  return out;
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
