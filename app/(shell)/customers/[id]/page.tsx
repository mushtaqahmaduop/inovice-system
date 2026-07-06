import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatAed } from "@/lib/money";

// Customer ledger (task 5.2): every invoice + payment for one customer,
// with balances. All money comes from sealed columns and the derived
// invoice_list view — nothing recomputed. Balance counts ISSUED invoices
// only: drafts owe nothing yet, voided invoices are out of force.
export default async function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, type, trn, phone, email, address, notes, deleted_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();

  const { data: invoices } = await supabase
    .from("invoice_list")
    .select(
      "id, invoice_number, status, payment_status, paid_total, grand_total, issue_date, created_at"
    )
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  const rows = invoices ?? [];
  const invoiceIds = rows.map((r) => r.id);
  const { data: payments } = invoiceIds.length
    ? await supabase
        .from("payments")
        .select("id, invoice_id, amount, received_on, reference, reverses_payment_id, method_id")
        .in("invoice_id", invoiceIds)
        .order("received_on", { ascending: false })
        .limit(50)
    : { data: [] };
  const { data: methods } = await supabase.from("payment_methods").select("id, label");
  const methodLabel = new Map((methods ?? []).map((m) => [m.id, m.label]));
  const numberById = new Map(rows.map((r) => [r.id, r.invoice_number]));

  const issued = rows.filter((r) => r.status === "issued");
  const totalInvoiced = issued.reduce((s, r) => s + (r.grand_total ?? 0), 0);
  const totalPaid = issued.reduce((s, r) => s + (r.paid_total ?? 0), 0);
  const balance = totalInvoiced - totalPaid;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            Customer ledger
          </p>
          <h1
            className={`text-[16px] font-medium tracking-tight text-ink ${customer.deleted_at ? "line-through" : ""}`}
          >
            {customer.name}
          </h1>
          <p className="text-[11px] text-ink-3">
            <span className="mono uppercase">
              {customer.type === "walk_in" ? "walk-in" : "regular"}
            </span>
            {customer.trn ? (
              <>
                {" "}
                · TRN <span className="mono">{customer.trn}</span>
              </>
            ) : null}
            {customer.phone ? (
              <>
                {" "}
                · <span className="mono">{customer.phone}</span>
              </>
            ) : null}
            {customer.deleted_at ? " · deleted" : null}
          </p>
          {customer.address ? <p className="text-[11px] text-ink-3">{customer.address}</p> : null}
        </div>
        <Link
          href="/customers"
          className="mono text-[11px] text-primary underline-offset-2 hover:underline"
        >
          ← all customers
        </Link>
      </div>

      {/* Balances — issued invoices only; stacked at 390px (brief §3 #10) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Invoiced (sealed)" value={`AED ${formatAed(totalInvoiced)}`} />
        <Stat label="Paid" value={`AED ${formatAed(totalPaid)}`} />
        <Stat
          label={balance >= 0 ? "Outstanding" : "Overpaid"}
          value={`AED ${formatAed(Math.abs(balance))}`}
          warn={balance > 0}
        />
      </div>

      {/* Invoices */}
      <p className="mono mb-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Invoices</p>

      {/* Below sm the invoice table becomes stacked cards keyed by number. */}
      <div className="mb-6 border border-hairline bg-surface sm:hidden">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`}
            className="block border-b border-hairline px-3 py-2.5 last:border-b-0 hover:bg-accent/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono text-[12px] text-primary">{r.invoice_number ?? "draft"}</span>
              <span className="mono text-[12px] text-ink">
                {r.grand_total !== null ? `AED ${formatAed(r.grand_total)}` : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="mono text-[11px] text-ink-3">{r.issue_date ?? "—"}</span>
              <span className="mono text-[9px] tracking-[0.1em] uppercase">
                <span className="text-ink-3">
                  {r.status === "issued" ? "· sealed ·" : r.status}
                </span>
                {r.status === "issued" ? (
                  <span
                    className={`ml-2 ${r.payment_status === "paid" ? "text-success" : "text-ink-3"}`}
                  >
                    {r.payment_status ?? "—"}
                  </span>
                ) : null}
              </span>
            </div>
          </Link>
        ))}
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-3">No invoices yet.</p>
        ) : null}
      </div>

      <div className="mb-6 hidden overflow-x-auto border border-hairline bg-surface sm:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              {["Number", "Issued", "Total", "Paid", "Status", "Payment"].map((h) => (
                <th
                  key={h}
                  className="mono px-3 py-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-hairline last:border-b-0 hover:bg-accent/50"
              >
                <td className="px-3 py-2">
                  <Link
                    href={r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`}
                    className="mono text-[12px] text-primary underline-offset-2 hover:underline"
                  >
                    {r.invoice_number ?? "draft"}
                  </Link>
                </td>
                <td className="mono px-3 py-2 text-[11.5px] text-ink-3">{r.issue_date ?? "—"}</td>
                <td className="mono px-3 py-2 text-[12px] text-ink">
                  {r.grand_total !== null ? `AED ${formatAed(r.grand_total)}` : "—"}
                </td>
                <td className="mono px-3 py-2 text-[12px] text-ink-2">
                  {r.status === "issued" ? `AED ${formatAed(r.paid_total ?? 0)}` : "—"}
                </td>
                <td className="mono px-3 py-2 text-[9px] tracking-[0.1em] text-ink-3 uppercase">
                  {r.status === "issued" ? "· sealed ·" : r.status}
                </td>
                <td className="mono px-3 py-2 text-[9px] tracking-[0.1em] uppercase">
                  <span className={r.payment_status === "paid" ? "text-success" : "text-ink-3"}>
                    {r.payment_status ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-ink-3">
                  No invoices yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Payments */}
      <p className="mono mb-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
        Payments (latest 50)
      </p>
      <div className="divide-y divide-hairline border border-hairline bg-surface">
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="mono w-24 text-[11.5px] text-ink-3">{p.received_on}</span>
            <span
              className={`mono w-28 text-right text-[12px] ${p.amount < 0 ? "text-warning" : "text-ink"}`}
            >
              {p.amount < 0 ? "−" : ""}AED {formatAed(Math.abs(p.amount))}
            </span>
            <span className="text-[11.5px] text-ink-2">{methodLabel.get(p.method_id) ?? "—"}</span>
            <span className="mono text-[11px] text-ink-3">
              {numberById.get(p.invoice_id) ?? "—"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-4">
              {p.reference ?? ""}
            </span>
            {p.reverses_payment_id ? (
              <span className="mono text-[9px] tracking-[0.1em] text-warning uppercase">
                reversal
              </span>
            ) : null}
          </div>
        ))}
        {(payments ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-3">No payments yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-hairline bg-surface p-3">
      <p className="mono mb-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">{label}</p>
      <p className={`mono text-[15px] font-medium ${warn ? "text-warning" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
