// Money helpers (SCHEMA_DESIGN §7 / CLAUDE.md §3.3). ALL amounts are
// integers in fils (AED × 100). These are the ONLY sanctioned conversions:
// user input parses string → fils with rejection of >2 decimals; display
// formats from integer math. No floats ever touch stored values.

/** Parse a user-entered AED amount ("1,234.50") into fils. Returns null for
 *  anything invalid — including >2 decimals, negatives, and empty input. */
export function aedToFils(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const fils = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(fils) ? fils : null;
}

/** Format fils as an AED string with thousands grouping: 123456 → "1,234.56". */
export function formatAed(fils: number): string {
  const neg = fils < 0;
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = `${whole}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${out}` : out;
}
