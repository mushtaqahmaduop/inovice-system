"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Cash-flow overview (dashboard). Two real series over one calendar HALF-YEAR
// — Jan–Jun or Jul–Dec, six monthly buckets (owner, 2026-07-31; it was twelve
// rolling months, and days before that): Invoiced (sealed customer totals by
// issue_date) as a filled area, and Paid (net payments by received_on) as a
// dashed line. Each point is that month's own total, not a running sum.
// Values arrive in AED decimals already — the server does the fils→AED
// boundary.
export type CashFlowPoint = { label: string; invoiced: number; paid: number };

const ACCENT = "var(--accent)";

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-border bg-surface-raised px-3 py-2 shadow-[var(--shadow-popover)]">
      <p className="mono mb-1 text-[11px] tracking-[0.06em] text-text-tertiary uppercase">
        {label}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="mono flex items-center gap-2 text-[12px] text-foreground">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto font-medium">
            AED {p.value.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
          </span>
        </p>
      ))}
    </div>
  );
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return (
    // Owner, 2026-07-31: the plot and its month labels sit lower in the card —
    // the labels were crowding the baseline. mt-1 drops the whole plot, and the
    // XAxis dy below pushes the month names further clear of the axis; the
    // bottom margin is the room they need so nothing clips.
    <div className="mt-1 h-[172px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
          <defs>
            <linearGradient id="invoicedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          {/* "This year" feeds twelve labels into a narrow card, where they
              would overlap. minTickGap lets recharts thin them out while
              preserveStartEnd keeps the first and last month readable, so the
              window the header names is always the window the axis shows. */}
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={8}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            dy={14}
          />
          {/* Compact ticks — "AED 12,000" wrapped onto two lines in the
              gutter. The card's legend already establishes the currency. */}
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toLocaleString("en-AE")}k` : String(v)
            }
          />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area
            type="linear"
            name="Invoiced"
            dataKey="invoiced"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#invoicedFill)"
            dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            name="Paid"
            dataKey="paid"
            stroke={ACCENT}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
