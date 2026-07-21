"use client";

import dynamic from "next/dynamic";
import type { CashFlowPoint } from "./cash-flow-chart";

// recharts is ~100kB and only ever renders below the fold on the dashboard.
// The dashboard page is a Server Component, where `next/dynamic` with
// `ssr: false` isn't allowed — so this thin client boundary owns the lazy
// import, keeping recharts out of the initial JS bundle. A same-height
// placeholder holds the layout so nothing shifts when the chart hydrates in.
const Chart = dynamic(() => import("./cash-flow-chart").then((m) => m.CashFlowChart), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full animate-pulse rounded-[8px] bg-bg-sunken" />,
});

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return <Chart data={data} />;
}
