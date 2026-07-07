import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatAed } from "@/lib/money";
import { StatTile } from "@/components/ui/card";

// Dashboard (task 7.1, redesign slice 5). The client's one named report —
// "who still owes our money" — leads the page as the serif hero figure
// (PREMIUM_EXECUTION_GUIDE §4). Everything derives from sealed columns +
// the invoice_list view at read time; nothing is stored or recomputed.
export default async function DashboardPage() {
  const ctx = await requireUser();
  const supabase = await createClient();

  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [{ data: issued }, { data: events }, { data: profiles }] = await Promise.all([
    supabase
      .from("invoice_list")
      .select(
        "id, invoice_number, customer_id, customer_snapshot, issue_date, grand_total, paid_total, vat_amount, payment_status"
      )
      .eq("status", "issued"),
    supabase
      .from("invoice_events")
      .select("id, event_type, created_at, actor_id, invoice_id")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const rows = issued ?? [];
  const name = (r: (typeof rows)[number]) =>
    (r.customer_snapshot as { name?: string } | null)?.name ?? "—";

  // This month, from sealed values.
  const monthRows = rows.filter((r) => (r.issue_date ?? "") >= monthStart);
  const monthTotal = monthRows.reduce((s, r) => s + (r.grand_total ?? 0), 0);
  const monthVat = monthRows.reduce((s, r) => s + (r.vat_amount ?? 0), 0);

  // WHO OWES US — open balance per customer, largest first.
  const debtors = new Map<string, { name: string; open: number; count: number }>();
  for (const r of rows) {
    const due = (r.grand_total ?? 0) - (r.paid_total ?? 0);
    if (r.payment_status === "paid" || due <= 0) continue;
    const d = debtors.get(r.customer_id) ?? { name: name(r), open: 0, count: 0 };
    d.open += due;
    d.count += 1;
    debtors.set(r.customer_id, d);
  }
  const debtorList = [...debtors.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 10);
  const outstandingTotal = [...debtors.values()].reduce((s, d) => s + d.open, 0);

  const eventNumbers = new Map(rows.map((r) => [r.id, r.invoice_number]));
  const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const EVENT_LABEL: Record<string, string> = {
    created: "Draft created",
    draft_updated: "Draft edited",
    issued: "Issued",
    payment_recorded: "Payment recorded",
    payment_reversed: "Payment reversed",
    voided: "Voided",
    printed: "Printed",
    emailed: "Emailed",
  };
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="text-[18px] leading-[26px] font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Signed in as {ctx.fullName}
          {ctx.aal === "aal2" ? " (two-factor verified)" : ""}. Figures derive from sealed invoices
          and recorded payments — nothing here is ever edited by hand.
        </p>
      </header>

      {/* The screen's one serif display element: the figure that matters
          most (§4). Not a boxed card — it IS the page opening. */}
      <section className="mb-8">
        <p className="text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
          Outstanding — who owes us
        </p>
        <p className="serif mt-2 text-[34px] leading-10 font-semibold text-foreground">
          <span className="mr-2 align-middle text-[15px] font-normal text-text-tertiary">AED</span>
          <span className="mono tracking-tight">{formatAed(outstandingTotal)}</span>
        </p>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          {debtorList.length === 0
            ? "All sealed invoices are settled."
            : `Across ${debtorList.length} customer${debtorList.length === 1 ? "" : "s"} with open balances.`}
        </p>
      </section>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:max-w-[560px]">
        <StatTile
          label="Invoiced this month"
          prefix="AED"
          value={formatAed(monthTotal)}
          sub={`${monthRows.length} sealed`}
        />
        <StatTile label="VAT collected this month" prefix="AED" value={formatAed(monthVat)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
            Open balances by customer
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-surface">
            {debtorList.map((d) => (
              <Link
                key={d.id}
                href={`/customers/${d.id}`}
                className="flex min-h-[42px] items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-bg-sunken"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                  {d.name}
                </span>
                <span className="mono text-[12px] text-text-tertiary">
                  {d.count} invoice{d.count === 1 ? "" : "s"}
                </span>
                {/* Open ≠ overdue — burnt orange stays reserved for the
                    overdue predicate, so balances render in ink. */}
                <span className="mono text-[15px] font-medium text-foreground">
                  <span className="mr-1 text-[11px] font-normal text-text-tertiary">AED</span>
                  {formatAed(d.open)}
                </span>
              </Link>
            ))}
            {debtorList.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-text-secondary">
                Nobody owes anything — all sealed invoices are settled.
              </p>
            ) : null}
            {debtorList.length > 0 ? (
              <Link
                href="/customers"
                className="block px-4 py-2.5 text-[13px] font-medium text-primary transition-colors duration-150 hover:bg-bg-sunken"
              >
                View all customers
              </Link>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
            Recent activity
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-surface">
            {(events ?? []).map((e) => (
              <Link
                key={e.id}
                href={`/invoices/${e.invoice_id}`}
                className="flex min-h-[42px] items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-bg-sunken"
              >
                <span className="mono w-20 shrink-0 text-[13px] font-medium text-foreground">
                  {eventNumbers.get(e.invoice_id) ?? "Draft"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
                  {EVENT_LABEL[e.event_type] ?? e.event_type}
                </span>
                <span className="text-[12px] text-text-tertiary">
                  {person.get(e.actor_id ?? "") ?? "system"}
                </span>
                <span className="mono text-[12px] text-text-tertiary">
                  {timeFmt.format(new Date(e.created_at))}
                </span>
              </Link>
            ))}
            {(events ?? []).length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-text-secondary">
                No activity yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
