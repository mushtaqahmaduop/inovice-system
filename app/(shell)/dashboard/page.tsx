import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatAed } from "@/lib/money";

// Dashboard (task 7.1). The client's one named report — "who still owes
// our money" — leads the page. Everything derives from sealed columns +
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
    created: "draft created",
    draft_updated: "draft edited",
    issued: "issued",
    payment_recorded: "payment recorded",
    payment_reversed: "payment reversed",
    voided: "voided",
    printed: "printed",
    emailed: "emailed",
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
        Signed in as {ctx.fullName}
        {ctx.aal === "aal2" ? " (two-factor verified)" : ""}. Figures derive from sealed
        invoices and recorded payments — nothing here is ever edited by hand.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Outstanding — who owes us"
          value={`AED ${formatAed(outstandingTotal)}`}
          warn={outstandingTotal > 0}
        />
        <Stat label="Invoiced this month" value={`AED ${formatAed(monthTotal)}`} sub={`${monthRows.length} sealed`} />
        <Stat label="VAT collected this month" value={`AED ${formatAed(monthVat)}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mono mb-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
            Open balances by customer
          </p>
          <div className="divide-y divide-hairline border border-hairline bg-surface">
            {debtorList.map((d) => (
              <Link
                key={d.id}
                href={`/customers/${d.id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{d.name}</span>
                <span className="mono text-[10px] text-ink-3">
                  {d.count} invoice{d.count === 1 ? "" : "s"}
                </span>
                <span className="mono text-[13px] font-medium text-warning">
                  AED {formatAed(d.open)}
                </span>
              </Link>
            ))}
            {debtorList.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-ink-3">
                Nobody owes anything — all sealed invoices are settled.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mono mb-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
            Recent activity
          </p>
          <div className="divide-y divide-hairline border border-hairline bg-surface">
            {(events ?? []).map((e) => (
              <Link
                key={e.id}
                href={`/invoices/${e.invoice_id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent"
              >
                <span className="mono w-20 shrink-0 text-[11px] text-ink-2">
                  {eventNumbers.get(e.invoice_id) ?? "draft"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                  {EVENT_LABEL[e.event_type] ?? e.event_type}
                </span>
                <span className="mono text-[10px] text-ink-3">
                  {person.get(e.actor_id ?? "") ?? "system"}
                </span>
                <span className="mono text-[10px] text-ink-4">
                  {new Date(e.created_at).toISOString().slice(5, 16).replace("T", " ")}
                </span>
              </Link>
            ))}
            {(events ?? []).length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-ink-3">No activity yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="border border-hairline bg-surface p-4">
      <p className="mono mb-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">{label}</p>
      <p className={`mono text-[18px] font-medium ${warn ? "text-warning" : "text-ink"}`}>{value}</p>
      {sub ? <p className="mono mt-0.5 text-[10px] text-ink-3">{sub}</p> : null}
    </div>
  );
}
