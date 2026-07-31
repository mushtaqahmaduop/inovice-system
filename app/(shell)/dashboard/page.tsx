import Link from "next/link";
import {
  Ban,
  CircleDollarSign,
  FileText,
  PencilLine,
  Printer,
  Send,
  Trash2,
  Wallet,
  Percent,
  Plus,
  ListPlus,
  UserCog,
  UserPlus,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatAed } from "@/lib/money";
import { AedFlow } from "@/components/ui/aed-flow";
import type { CashFlowPoint } from "@/components/dashboard/cash-flow-chart";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart-lazy";
import { OnlineEmployees } from "@/components/dashboard/online-employees";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { monthLabel, monthOf, resolvePeriod } from "@/lib/dashboard-period";

// Dashboard (task 7.1 → redesign slice 7, "premium" look). Full-width, KPI
// row led by the client's one named figure — "who owes us" — as a filled
// accent hero, a real cash-flow area chart (recharts), the recent-activity
// feed and a top-customers table. Everything derives from sealed columns +
// the invoice_list view and the payments ledger at read time; nothing is
// stored or recomputed. Trend chips are real month-over-month deltas.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  const period = resolvePeriod((await searchParams).period, now);
  // The chart's monthly buckets bound the payments we need to read — six for
  // a half-year window, twelve for "this year".
  const chartStart = period.monthKeys[0] + "-01";

  const [
    { data: issued },
    { data: payments },
    { data: events },
    { data: profiles },
    { count: draftCount },
    { data: tombstones },
  ] = await Promise.all([
    supabase
      .from("invoice_list")
      .select(
        "id, invoice_number, customer_id, customer_snapshot, issue_date, customer_total, paid_total, vat_amount, payment_status"
      )
      .eq("status", "issued"),
    supabase.from("payments").select("amount, received_on").gte("received_on", chartStart),
    supabase
      .from("invoice_events")
      .select("id, event_type, created_at, actor_id, invoice_id")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("profiles").select("id, full_name"),
    supabase
      .from("invoice_list")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    // D-31 tombstones — a deleted draft leaves no invoice_events row (they go
    // with it), so the feed reads them from here to keep the trail visible.
    supabase
      .from("deleted_drafts")
      .select("id, customer_name, deleted_by, deleted_by_name, deleted_at")
      .order("deleted_at", { ascending: false })
      .limit(8),
  ]);

  const rows = issued ?? [];
  const pays = payments ?? [];
  const drafts = draftCount ?? 0;
  const unpaidRows = rows.filter((r) => r.payment_status !== "paid");
  const unpaidTotal = unpaidRows.reduce(
    (s, r) => s + ((r.customer_total ?? 0) - (r.paid_total ?? 0)),
    0
  );
  const custName = (r: (typeof rows)[number]) =>
    (r.customer_snapshot as { name?: string } | null)?.name ?? "—";

  // ── The selected period, and the comparable one before it ────────────────
  const within = (d: string | null, from: string | null, toEx: string) =>
    d !== null && (from === null || d >= from) && d < toEx;

  const periodRows = rows.filter((r) => within(r.issue_date, period.start, period.endEx));
  const periodTotal = periodRows.reduce((s, r) => s + (r.customer_total ?? 0), 0);
  const periodVat = periodRows.reduce((s, r) => s + (r.vat_amount ?? 0), 0);

  const prevRows =
    period.prevEndEx === null
      ? []
      : rows.filter((r) => within(r.issue_date, period.prevStart, period.prevEndEx!));
  const prevTotal = prevRows.reduce((s, r) => s + (r.customer_total ?? 0), 0);
  const prevVat = prevRows.reduce((s, r) => s + (r.vat_amount ?? 0), 0);

  // ── Outstanding — open balance per customer, largest first ────────────────
  const debtors = new Map<string, { name: string; open: number; count: number }>();
  for (const r of rows) {
    const due = (r.customer_total ?? 0) - (r.paid_total ?? 0);
    if (r.payment_status === "paid" || due <= 0) continue;
    const d = debtors.get(r.customer_id) ?? { name: custName(r), open: 0, count: 0 };
    d.open += due;
    d.count += 1;
    debtors.set(r.customer_id, d);
  }
  const outstandingTotal = [...debtors.values()].reduce((s, d) => s + d.open, 0);

  // ── Cash-flow: MONTHLY invoiced (issue_date) + net paid (received_on) ─────
  // Owner, 2026-07-27: monthly, not daily. Each point is that month's own
  // total — no running sum, which only existed to keep a lumpy daily series
  // legible. The bucket span comes from the period — see lib/dashboard-period.
  const invByMonth = new Map<string, number>();
  for (const r of rows) {
    if (!r.issue_date) continue;
    const k = monthOf(r.issue_date);
    invByMonth.set(k, (invByMonth.get(k) ?? 0) + (r.customer_total ?? 0));
  }
  const paidByMonth = new Map<string, number>();
  for (const p of pays) {
    const k = monthOf(p.received_on);
    paidByMonth.set(k, (paidByMonth.get(k) ?? 0) + (p.amount ?? 0));
  }
  const cashFlow: CashFlowPoint[] = period.monthKeys.map((k) => ({
    label: monthLabel(k),
    invoiced: (invByMonth.get(k) ?? 0) / 100,
    paid: (paidByMonth.get(k) ?? 0) / 100,
  }));

  // ── Top customers in the selected period ─────────────────────────────────
  const tc = new Map<string, { name: string; count: number; invoiced: number; paid: number }>();
  for (const r of periodRows) {
    const t = tc.get(r.customer_id) ?? { name: custName(r), count: 0, invoiced: 0, paid: 0 };
    t.count += 1;
    t.invoiced += r.customer_total ?? 0;
    t.paid += r.paid_total ?? 0;
    tc.set(r.customer_id, t);
  }
  const topCustomers = [...tc.entries()]
    .map(([id, t]) => ({ id, ...t, balance: Math.max(0, t.invoiced - t.paid) }))
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 6);

  // ── Recent activity ───────────────────────────────────────────────────────
  // Two sources, one chronological feed: the append-only invoice_events, plus
  // the D-31 tombstones of drafts that were deleted (whose events are gone).
  const eventNumbers = new Map(rows.map((r) => [r.id, r.invoice_number]));
  const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  type FeedItem = {
    key: string;
    kind: string;
    href: string | null;
    ref: string;
    actor: string;
    at: string;
  };
  const feed: FeedItem[] = [
    ...(events ?? []).map((e) => ({
      key: `e-${e.id}`,
      kind: e.event_type,
      href: `/invoices/${e.invoice_id}`,
      ref: eventNumbers.get(e.invoice_id) ?? "Draft",
      actor: person.get(e.actor_id ?? "") ?? "system",
      at: e.created_at as string,
    })),
    ...(tombstones ?? []).map((t) => ({
      key: `d-${t.id}`,
      kind: "draft_deleted",
      href: null, // there is nothing left to open
      ref: t.customer_name ?? "Draft",
      // The stored name is the durable one — it outlives the profile row.
      actor: t.deleted_by_name ?? person.get(t.deleted_by ?? "") ?? "system",
      at: t.deleted_at as string,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="w-full px-5 py-4 md:px-8">
      {/* One toolbar row instead of three stacked blocks (owner, 2026-07-27:
          "the page is half showing"). Heading, what-needs-action pills and the
          period chip share a single line, so the figures start above the fold
          on a 768px laptop. The topbar no longer repeats the page name. */}
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {unpaidRows.length > 0 ? (
            <Link
              href="/invoices?filter=unpaid"
              className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[12px] font-medium text-foreground hover:border-warn/60"
            >
              <CircleDollarSign className="size-3.5 text-warn" />
              {unpaidRows.length} unpaid · AED {formatAed(unpaidTotal)}
            </Link>
          ) : null}
          {drafts > 0 ? (
            <Link
              href="/invoices?filter=draft"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:border-border-strong"
            >
              <PencilLine className="size-3.5" />
              {drafts} open {drafts === 1 ? "draft" : "drafts"}
            </Link>
          ) : null}
        </div>
        <PeriodFilter value={period.key} />
      </header>

      {/* KPI row — the client's named figure leads as a filled accent hero.
          Owner, 2026-07-31: Quick Actions moved up beside the VAT figure and
          cut to the four that get used, so the whole row sits on one line and
          the page below it climbs. The three KPIs give up width to make room;
          the hero keeps a little extra because its figure is the longest. */}
      <div className="mb-3 grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr_1fr]">
        <HeroCard total={outstandingTotal} settled={debtors.size === 0} count={debtors.size} />
        <KpiCard
          label={`Invoiced ${period.suffix}`}
          valueFils={periodTotal}
          icon={<Wallet className="size-5" />}
          foot={`${periodRows.length} sealed`}
          trend={pctTrend(periodTotal, prevTotal)}
          trendNote={period.key === "this-year" ? "vs last year" : "vs the period before"}
        />
        <KpiCard
          label={`VAT collected ${period.suffix}`}
          valueFils={periodVat}
          icon={<Percent className="size-5" />}
          trend={pctTrend(periodVat, prevVat)}
          trendNote={period.key === "this-year" ? "vs last year" : "vs the period before"}
        />
        <QuickActions isAdmin={ctx.role === "admin"} />
      </div>

      {/* Cash flow + top customers (+ online employees, admin only).
          Owner, 2026-07-27: Top Customers and Recent Activity swap places AND
          shapes. Customers is a short ranked list — it belongs in the narrow
          column beside the chart; activity has four facts per row (what, which
          invoice, who, when) and reads far better across the full width. */}
      <div
        className={`mb-3 grid gap-3 ${
          ctx.role === "admin" ? "lg:grid-cols-[1.4fr_1fr_1fr]" : "lg:grid-cols-[1.7fr_1fr]"
        }`}
      >
        <section className="rounded-[14px] border border-border bg-surface p-4">
          {/* Title, legend and window on ONE line — the legend used to sit on
              its own row under the title and cost ~22px of fold. */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <h2 className="text-[15px] font-semibold text-foreground">Cash Flow Overview</h2>
              <Legend dash={false} label="Invoiced" />
              <Legend dash label="Paid" />
            </div>
            <span className="text-[12px] text-text-tertiary">
              {monthLabel(period.monthKeys[0])} –{" "}
              {monthLabel(period.monthKeys[period.monthKeys.length - 1])}
            </span>
          </div>
          <CashFlowChart data={cashFlow} />
        </section>

        <section className="rounded-[14px] border border-border bg-surface p-4">
          {/* No "(This Month)" here — the period chip in the page header says
              it once, and the pair wrapped the title in the narrow column. */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="shrink-0 text-[15px] font-semibold text-foreground">Top Customers</h2>
            <Link
              href="/customers"
              className="shrink-0 text-[13px] font-medium text-primary hover:underline"
            >
              View report
            </Link>
          </div>
          <ul className="flex flex-col">
            {topCustomers.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="-mx-2 flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-bg-sunken"
                >
                  <Avatar name={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-foreground">
                      {c.name}
                    </span>
                    <span className="block truncate text-[12px] text-text-tertiary">
                      {c.count} invoice{c.count === 1 ? "" : "s"} ·{" "}
                      {c.balance > 0 ? `AED ${formatAed(c.balance)} open` : "settled"}
                    </span>
                  </span>
                  <span className="mono shrink-0 text-right text-[13px] font-medium text-primary">
                    {formatAed(c.invoiced)}
                  </span>
                </Link>
              </li>
            ))}
            {topCustomers.length === 0 ? (
              <li className="py-8 text-center text-[13px] text-text-secondary">
                No sealed invoices this month yet.
              </li>
            ) : null}
          </ul>
        </section>

        {ctx.role === "admin" ? <OnlineEmployees /> : null}
      </div>

      {/* Recent activity — full width, one row per event. */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Recent Activity</h2>
          <Link href="/invoices" className="text-[13px] font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <ul className="flex flex-col">
          {feed.map((f) => {
            const inner = (
              <>
                <ActivityIcon type={f.kind} />
                <span className="min-w-0 flex-1 text-[13px] text-foreground">
                  {ACTIVITY_LABEL[f.kind] ?? f.kind}
                </span>
                {/* A deleted draft has no number left, so its reference is the
                    customer's name — plain text, never dressed as a number. */}
                <span
                  className={`hidden w-[16ch] shrink-0 truncate text-[13px] sm:block ${
                    f.kind === "draft_deleted"
                      ? "text-text-secondary"
                      : "mono font-semibold text-primary"
                  }`}
                  title={f.ref}
                >
                  {f.ref}
                </span>
                <span className="hidden w-[18ch] shrink-0 truncate text-right text-[12px] text-text-secondary sm:block">
                  {f.actor}
                </span>
                <span className="mono w-[13ch] shrink-0 text-right text-[12px] text-text-tertiary">
                  {timeFmt.format(new Date(f.at))}
                </span>
              </>
            );
            return (
              <li key={f.key}>
                {f.href ? (
                  <Link
                    href={f.href}
                    className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-bg-sunken"
                  >
                    {inner}
                  </Link>
                ) : (
                  <span className="-mx-2 flex items-center gap-3 rounded-[8px] px-2 py-2">
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
          {feed.length === 0 ? (
            <li className="py-8 text-center text-[13px] text-text-secondary">No activity yet.</li>
          ) : null}
        </ul>
      </section>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-text-tertiary">
        Signed in as {ctx.fullName}
        {ctx.aal === "aal2" ? " (two-factor verified)" : ""}. All figures derive from sealed
        invoices and recorded payments — nothing is ever edited by hand.
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
    <div className="relative overflow-hidden rounded-[14px] bg-primary p-4 text-white">
      <p className="text-[12px] font-medium tracking-[0.04em] text-white/75 uppercase">
        Outstanding — who owes us
      </p>
      <p className="mt-2.5 text-[30px] leading-9 font-semibold">
        <span className="mr-1.5 align-middle text-[15px] font-normal text-white/70">AED</span>
        <AedFlow fils={total} className="mono tracking-tight" />
      </p>
      <p className="mt-2 text-[13px] text-white/80">
        {settled
          ? "All sealed invoices are settled."
          : `Across ${count} customer${count === 1 ? "" : "s"} with open balances.`}
      </p>
      <FileText className="absolute top-4 right-4 size-10 rounded-[10px] bg-white/15 p-2.5" />
    </div>
  );
}

function KpiCard({
  label,
  valueFils,
  icon,
  foot,
  trend,
  trendNote = "vs the period before",
}: {
  label: string;
  valueFils: number;
  icon: React.ReactNode;
  foot?: string;
  trend: Trend;
  trendNote?: string;
}) {
  return (
    <div className="relative rounded-[14px] border border-border bg-surface p-4">
      <p className="pr-12 text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        {label}
      </p>
      <p className="mt-2.5 text-[26px] leading-8 font-semibold text-foreground">
        <span className="mr-1.5 align-middle text-[14px] font-normal text-text-tertiary">AED</span>
        <AedFlow fils={valueFils} className="mono tracking-tight" />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
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
        {trend ? <span className="text-text-tertiary">{trendNote}</span> : null}
      </div>
      <span className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-[10px] bg-accent-soft text-primary">
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
  draft_deleted: "Draft deleted",
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
    draft_deleted: { icon: <Trash2 className="size-4" />, cls: "bg-neutral-soft text-error" },
  };
  const { icon, cls } = map[type] ?? map.created;
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] ${cls}`}>
      {icon}
    </span>
  );
}

// Quick Actions as the fourth KPI-row card (owner, 2026-07-31). Only the four
// creating actions live here — the navigational tiles this replaced ("All
// invoices", "Exports & reports", "Settings") are all permanent sidebar items,
// so nothing became unreachable. "Add user" is admin-only: /admin/users is
// guarded server-side, so offering it to staff would only produce a redirect;
// staff get the three remaining actions and the last one spans the row so the
// card still reads as a deliberate block rather than a grid with a hole.
function QuickActions({ isAdmin }: { isAdmin: boolean }) {
  const actions = [
    {
      href: "/invoices/new",
      icon: <Plus className="size-4" />,
      label: "New invoice",
      primary: true,
    },
    { href: "/customers", icon: <UserPlus className="size-4" />, label: "Add customer" },
    { href: "/services", icon: <ListPlus className="size-4" />, label: "Add service" },
    ...(isAdmin
      ? [{ href: "/admin/users", icon: <UserCog className="size-4" />, label: "Add user" }]
      : []),
  ];

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <p className="text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Quick actions
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {actions.map((a, i) => (
          <QuickAction
            key={a.href}
            href={a.href}
            icon={a.icon}
            label={a.label}
            primary={a.primary}
            wide={actions.length % 2 === 1 && i === actions.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

// One Quick Action tile. `primary` marks the single accent-filled action so the
// row still has one obvious lead (§5 — the accent carries primary actions).
function QuickAction({
  href,
  icon,
  label,
  primary = false,
  wide = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-[550] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        wide ? "col-span-2" : ""
      } ${
        primary
          ? "bg-primary text-on-accent hover:bg-[var(--accent-hover)]"
          : "border border-border-strong text-foreground hover:bg-bg-sunken"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
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
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
      {initials || "—"}
    </span>
  );
}
