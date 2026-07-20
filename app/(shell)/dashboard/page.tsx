import Link from "next/link";
import {
  Ban,
  Calendar,
  ChevronDown,
  CircleDollarSign,
  FileText,
  PencilLine,
  Printer,
  Send,
  Wallet,
  Percent,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatAed } from "@/lib/money";
import { AedFlow } from "@/components/ui/aed-flow";
import { CashFlowChart, type CashFlowPoint } from "@/components/dashboard/cash-flow-chart";
import { OnlineEmployees } from "@/components/dashboard/online-employees";

// Dashboard (task 7.1 → redesign slice 7, "premium" look). Full-width, KPI
// row led by the client's one named figure — "who owes us" — as a filled
// accent hero, a real cash-flow area chart (recharts), the recent-activity
// feed and a top-customers table. Everything derives from sealed columns +
// the invoice_list view and the payments ledger at read time; nothing is
// stored or recomputed. Trend chips are real month-over-month deltas.
export default async function DashboardPage() {
  const ctx = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  const monthStart = now.toISOString().slice(0, 8) + "01";
  const md = new Date(monthStart + "T00:00:00Z");
  const lastMonthStart = new Date(Date.UTC(md.getUTCFullYear(), md.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
  const monShort = now.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const todayDay = now.getUTCDate();

  const [{ data: issued }, { data: payments }, { data: events }, { data: profiles }, { count: draftCount }] =
    await Promise.all([
      supabase
        .from("invoice_list")
        .select(
          "id, invoice_number, customer_id, customer_snapshot, issue_date, grand_total, paid_total, vat_amount, payment_status"
        )
        .eq("status", "issued"),
      supabase.from("payments").select("amount, received_on").gte("received_on", lastMonthStart),
      supabase
        .from("invoice_events")
        .select("id, event_type, created_at, actor_id, invoice_id")
        .order("created_at", { ascending: false })
        .limit(7),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("invoice_list").select("id", { count: "exact", head: true }).eq("status", "draft"),
    ]);

  const rows = issued ?? [];
  const pays = payments ?? [];
  const drafts = draftCount ?? 0;
  const unpaidRows = rows.filter((r) => r.payment_status !== "paid");
  const unpaidTotal = unpaidRows.reduce(
    (s, r) => s + ((r.grand_total ?? 0) - (r.paid_total ?? 0)),
    0
  );
  const custName = (r: (typeof rows)[number]) =>
    (r.customer_snapshot as { name?: string } | null)?.name ?? "—";

  // ── This month & last month, from sealed values ──────────────────────────
  const inMonth = (d: string | null) => (d ?? "") >= monthStart;
  const inLastMonth = (d: string | null) => (d ?? "") >= lastMonthStart && (d ?? "") < monthStart;

  const monthRows = rows.filter((r) => inMonth(r.issue_date));
  const monthTotal = monthRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);
  const monthVat = monthRows.reduce((s, r) => s + (r.vat_amount ?? 0), 0);

  const lastRows = rows.filter((r) => inLastMonth(r.issue_date));
  const lastTotal = lastRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);
  const lastVat = lastRows.reduce((s, r) => s + (r.vat_amount ?? 0), 0);

  // ── Outstanding — open balance per customer, largest first ────────────────
  const debtors = new Map<string, { name: string; open: number; count: number }>();
  for (const r of rows) {
    const due = (r.grand_total ?? 0) - (r.paid_total ?? 0);
    if (r.payment_status === "paid" || due <= 0) continue;
    const d = debtors.get(r.customer_id) ?? { name: custName(r), open: 0, count: 0 };
    d.open += due;
    d.count += 1;
    debtors.set(r.customer_id, d);
  }
  const outstandingTotal = [...debtors.values()].reduce((s, d) => s + d.open, 0);

  // ── Cash-flow: daily invoiced (issue_date) + net paid (received_on) ───────
  const invByDay = new Map<string, number>();
  for (const r of monthRows)
    invByDay.set(
      r.issue_date ?? "",
      (invByDay.get(r.issue_date ?? "") ?? 0) + (r.grand_total ?? 0)
    );
  const paidByDay = new Map<string, number>();
  for (const p of pays) {
    if (p.received_on < monthStart) continue;
    paidByDay.set(p.received_on, (paidByDay.get(p.received_on) ?? 0) + (p.amount ?? 0));
  }
  // Cumulative across the month — a running total so the curve ascends to
  // the month's invoiced/collected figure even when activity is lumpy.
  const cashFlow: CashFlowPoint[] = [];
  let cumInv = 0;
  let cumPaid = 0;
  for (let day = 1; day <= todayDay; day++) {
    const iso = `${monthStart.slice(0, 8)}${String(day).padStart(2, "0")}`;
    cumInv += (invByDay.get(iso) ?? 0) / 100;
    cumPaid += (paidByDay.get(iso) ?? 0) / 100;
    cashFlow.push({
      day: `${String(day).padStart(2, "0")} ${monShort}`,
      invoiced: cumInv,
      paid: cumPaid,
    });
  }

  // ── Top customers this month ──────────────────────────────────────────────
  const tc = new Map<string, { name: string; count: number; invoiced: number; paid: number }>();
  for (const r of monthRows) {
    const t = tc.get(r.customer_id) ?? { name: custName(r), count: 0, invoiced: 0, paid: 0 };
    t.count += 1;
    t.invoiced += r.grand_total ?? 0;
    t.paid += r.paid_total ?? 0;
    tc.set(r.customer_id, t);
  }
  const topCustomers = [...tc.entries()]
    .map(([id, t]) => ({ id, ...t, balance: Math.max(0, t.invoiced - t.paid) }))
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 6);

  // ── Recent activity ───────────────────────────────────────────────────────
  const eventNumbers = new Map(rows.map((r) => [r.id, r.invoice_number]));
  const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  return (
    <div className="w-full px-5 py-4 md:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            Signed in as {ctx.fullName}
            {ctx.aal === "aal2" ? " (two-factor verified)" : ""}. Figures derive from sealed
            invoices and recorded payments.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-foreground">
          <Calendar className="size-4 text-text-tertiary" />
          This month
          <ChevronDown className="size-4 text-text-tertiary" />
        </span>
      </header>

      {/* Unpaid / drafts banner — surfaces what needs action before the KPI
          row buries it in figures. Hidden entirely when both are zero. */}
      {unpaidRows.length > 0 || drafts > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3">
          {unpaidRows.length > 0 ? (
            <Link
              href="/invoices?filter=unpaid"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground hover:underline"
            >
              <CircleDollarSign className="size-4 text-warn" />
              {unpaidRows.length} unpaid {unpaidRows.length === 1 ? "invoice" : "invoices"} ·{" "}
              {formatAed(unpaidTotal)} AED outstanding
            </Link>
          ) : null}
          {unpaidRows.length > 0 && drafts > 0 ? (
            <span className="text-text-tertiary" aria-hidden="true">
              ·
            </span>
          ) : null}
          {drafts > 0 ? (
            <Link
              href="/invoices?filter=draft"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground hover:underline"
            >
              <PencilLine className="size-4 text-warn" />
              {drafts} open {drafts === 1 ? "draft" : "drafts"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* KPI row — the client's named figure leads as a filled accent hero. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <HeroCard total={outstandingTotal} settled={debtors.size === 0} count={debtors.size} />
        <KpiCard
          label="Invoiced this month"
          valueFils={monthTotal}
          icon={<Wallet className="size-5" />}
          foot={`${monthRows.length} sealed`}
          trend={pctTrend(monthTotal, lastTotal)}
        />
        <KpiCard
          label="VAT collected this month"
          valueFils={monthVat}
          icon={<Percent className="size-5" />}
          trend={pctTrend(monthVat, lastVat)}
        />
      </div>

      {/* Cash flow + recent activity (+ online employees, admin only) */}
      <div
        className={`mb-4 grid gap-4 ${
          ctx.role === "admin" ? "lg:grid-cols-[1.4fr_1fr_1fr]" : "lg:grid-cols-[1.7fr_1fr]"
        }`}
      >
        <section className="rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Cash Flow Overview</h2>
              <div className="mt-1.5 flex items-center gap-4">
                <Legend dash={false} label="Invoiced" />
                <Legend dash label="Paid" />
              </div>
            </div>
          </div>
          <CashFlowChart data={cashFlow} />
        </section>

        <section className="rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">Recent Activity</h2>
            <Link href="/invoices" className="text-[13px] font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="flex flex-col">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link
                  href={`/invoices/${e.invoice_id}`}
                  className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-bg-sunken"
                >
                  <ActivityIcon type={e.event_type} />
                  <span className="min-w-0 flex-1">
                    <span className="mono block text-[13px] font-semibold text-foreground">
                      {eventNumbers.get(e.invoice_id) ?? "Draft"}
                    </span>
                    <span className="block text-[12px] text-text-secondary">
                      {ACTIVITY_LABEL[e.event_type] ?? e.event_type}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] text-text-secondary">
                      {person.get(e.actor_id ?? "") ?? "system"}
                    </span>
                    <span className="mono block text-[11px] text-text-tertiary">
                      {timeFmt.format(new Date(e.created_at))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {(events ?? []).length === 0 ? (
              <li className="py-8 text-center text-[13px] text-text-secondary">No activity yet.</li>
            ) : null}
          </ul>
        </section>

        {ctx.role === "admin" ? <OnlineEmployees /> : null}
      </div>

      {/* Top customers */}
      <section className="rounded-[14px] border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">
            Top Customers <span className="text-text-tertiary">(This Month)</span>
          </h2>
          <Link href="/customers" className="text-[13px] font-medium text-primary hover:underline">
            View report
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2.5 text-[12px] font-medium text-text-tertiary">Customer</th>
                <th className="pb-2.5 text-center text-[12px] font-medium text-text-tertiary">
                  Invoices
                </th>
                <th className="pb-2.5 text-right text-[12px] font-medium text-text-tertiary">
                  Invoiced (AED)
                </th>
                <th className="pb-2.5 text-right text-[12px] font-medium text-text-tertiary">
                  Paid (AED)
                </th>
                <th className="pb-2.5 text-right text-[12px] font-medium text-text-tertiary">
                  Balance (AED)
                </th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-b-0 hover:bg-bg-sunken"
                >
                  <td className="py-3">
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <span>
                        <span className="block text-[14px] font-medium text-foreground">
                          {c.name}
                        </span>
                        <span className="block text-[12px] text-text-tertiary">
                          {c.count} invoice{c.count === 1 ? "" : "s"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="mono py-3 text-center text-[13px] text-foreground">{c.count}</td>
                  <td className="mono py-3 text-right text-[13px] font-medium text-primary">
                    {formatAed(c.invoiced)}
                  </td>
                  <td className="mono py-3 text-right text-[13px] font-medium text-success">
                    {formatAed(c.paid)}
                  </td>
                  <td className="mono py-3 text-right text-[13px] font-medium text-foreground">
                    {formatAed(c.balance)}
                  </td>
                </tr>
              ))}
              {topCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[13px] text-text-secondary">
                    No sealed invoices this month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-text-tertiary">
        All figures derive from sealed invoices and recorded payments — nothing is ever edited by
        hand.
      </p>
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

type Trend = { pct: string; dir: "up" | "down" } | null;
function pctTrend(cur: number, prev: number): Trend {
  if (prev <= 0) return null;
  const delta = ((cur - prev) / prev) * 100;
  if (!isFinite(delta) || Math.abs(delta) < 0.05) return null;
  return { pct: `${Math.abs(delta).toFixed(1)}%`, dir: delta >= 0 ? "up" : "down" };
}

function HeroCard({ total, settled, count }: { total: number; settled: boolean; count: number }) {
  return (
    <div className="relative overflow-hidden rounded-[14px] bg-primary p-5 text-white">
      <p className="text-[12px] font-medium tracking-[0.04em] text-white/75 uppercase">
        Outstanding — who owes us
      </p>
      <p className="mt-3 text-[30px] leading-9 font-semibold">
        <span className="mr-1.5 align-middle text-[15px] font-normal text-white/70">AED</span>
        <AedFlow fils={total} className="mono tracking-tight" />
      </p>
      <p className="mt-3 text-[13px] text-white/80">
        {settled
          ? "All sealed invoices are settled."
          : `Across ${count} customer${count === 1 ? "" : "s"} with open balances.`}
      </p>
      <FileText className="absolute top-5 right-5 size-11 rounded-[10px] bg-white/15 p-2.5" />
    </div>
  );
}

function KpiCard({
  label,
  valueFils,
  icon,
  foot,
  trend,
}: {
  label: string;
  valueFils: number;
  icon: React.ReactNode;
  foot?: string;
  trend: Trend;
}) {
  return (
    <div className="relative rounded-[14px] border border-border bg-surface p-5">
      <p className="text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        {label}
      </p>
      <p className="mt-3 text-[26px] leading-8 font-semibold text-foreground">
        <span className="mr-1.5 align-middle text-[14px] font-normal text-text-tertiary">AED</span>
        <AedFlow fils={valueFils} className="mono tracking-tight" />
      </p>
      <div className="mt-3 flex items-center gap-2 text-[12px]">
        {trend ? (
          <span
            className={`mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
              trend.dir === "down" ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
            }`}
          >
            {trend.dir === "down" ? "↓" : "↑"} {trend.pct}
          </span>
        ) : null}
        {foot ? <span className="text-text-tertiary">{foot}</span> : null}
        {trend ? <span className="text-text-tertiary">vs last month</span> : null}
      </div>
      <span className="absolute top-5 right-5 flex size-11 items-center justify-center rounded-[10px] bg-accent-soft text-primary">
        {icon}
      </span>
    </div>
  );
}

function Legend({ label, dash }: { label: string; dash: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
      <svg width="18" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="18"
          y2="4"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray={dash ? "4 3" : "0"}
        />
      </svg>
      {label}
    </span>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  created: "Draft created",
  draft_updated: "Draft edited",
  issued: "Issued",
  payment_recorded: "Payment recorded",
  payment_reversed: "Payment reversed",
  voided: "Voided",
  printed: "Printed",
  emailed: "Emailed",
};

function ActivityIcon({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    printed: { icon: <Printer className="size-4" />, cls: "bg-accent-soft text-primary" },
    issued: { icon: <Send className="size-4" />, cls: "bg-accent-soft text-primary" },
    payment_recorded: {
      icon: <CircleDollarSign className="size-4" />,
      cls: "bg-success-soft text-success",
    },
    payment_reversed: {
      icon: <CircleDollarSign className="size-4" />,
      cls: "bg-danger-soft text-danger",
    },
    voided: { icon: <Ban className="size-4" />, cls: "bg-danger-soft text-danger" },
    created: { icon: <FileText className="size-4" />, cls: "bg-neutral-soft text-text-secondary" },
    draft_updated: {
      icon: <PencilLine className="size-4" />,
      cls: "bg-neutral-soft text-text-secondary",
    },
  };
  const { icon, cls } = map[type] ?? map.created;
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] ${cls}`}>
      {icon}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
      {initials || "—"}
    </span>
  );
}
