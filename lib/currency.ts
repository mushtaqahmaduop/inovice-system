// Foreign-currency DISPLAY helpers (AED-anchored model). The invoice is priced
// and sealed in AED fils (lib/money.ts) — the ONLY money representation and the
// FTA record of truth. These helpers derive a display-only foreign rendering
// from a sealed AED amount + a snapshotted exchange rate. No foreign amount is
// ever stored; it is always recomputed, so it can never drift from the seal.
//
// Rate convention: `exchange_rate_e6` = round(AED per 1 foreign unit × 1e6).
// e.g. 1 USD = 3.6725 AED → 3_672_500. Scaled integer, no floats stored.

import { formatAed } from "./money";

export type CurrencyMeta = { code: string; symbol: string; name: string };

export const AED = "AED";
export const RATE_SCALE = 1_000_000;

// Supported display currencies (all 2-decimal minor units). AED is the anchor
// and MUST stay first — it is the default and the money-of-record.
export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "PKR", symbol: "PKR", name: "Pakistani Rupee" },
];

export const SUPPORTED_CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [
  string,
  ...string[],
];

/** A currency other than the AED anchor — the only case that renders foreign. */
export function isForeignCurrency(code: string | null | undefined): boolean {
  return !!code && code !== AED;
}

export function currencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/** Parse a user-entered exchange rate ("3.6725") into e6 units. AED per 1 unit
 *  of the foreign currency. Rejects junk, ≤ 0, and > 6 decimal places. Mirrors
 *  aedToFils' strictness (the sanctioned parse boundary). */
export function parseRateToE6(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const e6 = Number(whole) * RATE_SCALE + Number((frac + "000000").slice(0, 6));
  return Number.isSafeInteger(e6) && e6 > 0 ? e6 : null;
}

/** Render an e6 rate back to a plain decimal string for the input field
 *  (trailing zeros trimmed): 3_672_500 → "3.6725". */
export function formatRateFromE6(e6: number): string {
  const whole = Math.floor(e6 / RATE_SCALE);
  const frac = String(e6 % RATE_SCALE)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

/** Derive foreign minor units (e.g. US cents) from a sealed AED fils amount and
 *  the snapshotted rate. Display only — the AED fils stay the record of truth,
 *  so float math is acceptable here (rounded to whole minor units). */
export function foreignMinor(aedFils: number, rateE6: number): number {
  return Math.round((aedFils * RATE_SCALE) / rateE6);
}

/** Numeric foreign figure, grouped to 2 decimals with no currency text —
 *  reuses formatAed's integer-minor formatting (it emits no "AED"). Callers
 *  prepend the currency code/symbol. */
export function formatForeign(aedFils: number, rateE6: number): string {
  return formatAed(foreignMinor(aedFils, rateE6));
}
