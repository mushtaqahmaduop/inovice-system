// Dashboard period filter (owner, 2026-07-27 — the "This month" chip was
// decorative; it now drives the figures).
//
// Everything is computed in UTC: issue_date / received_on are `date` columns
// and the server clock is UTC on Vercel, so mixing in a local timezone here
// would shift invoices across month boundaries.
//
// The cash-flow chart is monthly (owner's request) and shows one CALENDAR
// HALF-YEAR — Jan–Jun or Jul–Dec (owner, 2026-07-31). Six buckets, never a
// rolling twelve, so the axis labels stay readable and the window is a period
// the client already thinks in. It auto-advances: the half is derived from the
// selected period's last month, so on 1 January the chart flips from Jul–Dec
// to Jan–Jun of the new year with no code change. `monthKeys` is the seam a
// five-year panel would hang off later.

export const PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-year", label: "This year" },
  { key: "all", label: "All time" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export type Period = {
  key: PeriodKey;
  /** Chip / menu wording — "This month". */
  label: string;
  /** KPI wording — "Invoiced this month", "Invoiced in 2026". */
  suffix: string;
  /** Inclusive ISO date, or null for "since the beginning". */
  start: string | null;
  /** Exclusive ISO date. */
  endEx: string;
  /** The comparable previous window, or null when a trend is meaningless. */
  prevStart: string | null;
  prevEndEx: string | null;
  /** The six YYYY-MM buckets of the calendar half-year holding the period's
   *  last month — Jan–Jun or Jul–Dec. */
  monthKeys: string[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, day = 1) => new Date(Date.UTC(y, m, day));

export function isPeriodKey(v: string | null | undefined): v is PeriodKey {
  return PERIODS.some((p) => p.key === v);
}

export function resolvePeriod(key: string | null | undefined, now: Date): Period {
  const k: PeriodKey = isPeriodKey(key) ? key : "this-month";
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  let start: string | null;
  let endEx: string;
  let prevStart: string | null;
  let prevEndEx: string | null;
  let suffix: string;

  if (k === "this-month") {
    start = iso(utc(y, m));
    endEx = iso(utc(y, m + 1));
    prevStart = iso(utc(y, m - 1));
    prevEndEx = start;
    suffix = "this month";
  } else if (k === "last-month") {
    start = iso(utc(y, m - 1));
    endEx = iso(utc(y, m));
    prevStart = iso(utc(y, m - 2));
    prevEndEx = start;
    suffix = "last month";
  } else if (k === "this-year") {
    start = iso(utc(y, 0));
    endEx = iso(utc(y + 1, 0));
    prevStart = iso(utc(y - 1, 0));
    prevEndEx = start;
    suffix = `in ${y}`;
  } else {
    start = null;
    endEx = iso(utc(y, m + 1));
    // No trend for all-time: there is nothing to compare it against.
    prevStart = null;
    prevEndEx = null;
    suffix = "all time";
  }

  // Last month covered by the period — for "this month" and "all time" that is
  // the current month; for "this year" it is December.
  const lastDay = new Date(Date.parse(endEx + "T00:00:00Z") - 86400000);
  const lm = lastDay.getUTCMonth();
  const ly = lastDay.getUTCFullYear();
  // Snap to the calendar half-year that month sits in: months 0–5 → Jan–Jun,
  // months 6–11 → Jul–Dec. Months still to come stay in the window as empty
  // buckets, so the client sees the shape of the whole half at a glance.
  const halfStart = lm < 6 ? 0 : 6;
  const monthKeys: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = utc(ly, halfStart + i);
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return {
    key: k,
    label: PERIODS.find((p) => p.key === k)!.label,
    suffix,
    start,
    endEx,
    prevStart,
    prevEndEx,
    monthKeys,
  };
}

/** "2026-07" → "Jul 26" for a compact monthly axis. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = utc(y, m - 1).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${name} ${String(y).slice(2)}`;
}

/** The YYYY-MM bucket an ISO date falls in. */
export const monthOf = (isoDate: string) => isoDate.slice(0, 7);
