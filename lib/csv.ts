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
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvDocument(header: string[], rows: (string | number | null)[][]): string {
  // \r\n line endings + UTF-8 BOM: what Excel expects.
  const lines = [header, ...rows].map((r) => r.map(csvField).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
