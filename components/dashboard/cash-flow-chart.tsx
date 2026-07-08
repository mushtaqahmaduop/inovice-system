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

// Cash-flow overview (dashboard). Two real series over the selected month:
// Invoiced (sealed grand totals by issue_date) as a filled area, and Paid
// (net payments by received_on) as a dashed line. Values arrive in AED
// decimals already — the server does the fils→AED boundary.
export type CashFlowPoint = { day: string; invoiced: number; paid: number };

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
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="invoicedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            dy={8}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            tickFormatter={(v: number) => `AED ${v}`}
          />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area
            type="monotone"
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
            type="monotone"
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
