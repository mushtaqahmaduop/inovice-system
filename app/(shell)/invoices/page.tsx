import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { InvoicesTable } from "./invoices-table";

export type InvoiceListRow = {
  id: string;
  invoice_number: string | null;
  status: "draft" | "issued" | "voided";
  payment_status: "unpaid" | "partial" | "paid" | null;
  paid_total: number;
  grand_total: number | null;
  issue_date: string | null;
  due_date: string | null;
  created_at: string;
  customer_name: string;
};

// Invoice list (task 4.3) — reads the invoice_list view (migration 0009):
// payment status derived from SUM(payments) at read time, never stored
// (SCHEMA_DESIGN §6); security_invoker keeps RLS on the caller. Drafts have
// no snapshot yet, so their display name joins from the customers list.
// Most-recent 500 fetched; the table filters/sorts/pages client-side.
export default async function InvoicesPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: rows }, { data: customers }, { data: settings }] = await Promise.all([
    supabase
      .from("invoice_list")
      .select(
        "id, invoice_number, status, payment_status, paid_total, grand_total, issue_date, due_date, created_at, customer_id, customer_snapshot"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("customers").select("id, name"),
    supabase.from("settings").select("due_days_default").limit(1).maybeSingle(),
  ]);

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const list: InvoiceListRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    payment_status: r.payment_status,
    paid_total: r.paid_total ?? 0,
    grand_total: r.grand_total,
    issue_date: r.issue_date,
    due_date: r.due_date,
    created_at: r.created_at,
    customer_name:
      (r.customer_snapshot as { name?: string } | null)?.name ?? nameById.get(r.customer_id) ?? "—",
  }));

  const issued = list.filter((r) => r.status === "issued").length;
  const drafts = list.filter((r) => r.status === "draft").length;

  return (
    <div className="w-full px-5 py-6 md:px-8">
      {/* Live refetch (R-5) rides the sidebar's single realtime subscriber. */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold text-foreground">Invoices</h1>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            {list.length === 1 ? "1 invoice" : `${list.length} invoices`} on record — {issued}{" "}
            sealed{drafts > 0 ? `, ${drafts} open ${drafts === 1 ? "draft" : "drafts"}` : ""}.
            Sealed invoices are immutable; payment status derives from recorded payments.
          </p>
        </div>
        {/* The only blue button on this screen (§4). */}
        <Button render={<Link href="/invoices/new" />}>Create invoice</Button>
      </div>
      <InvoicesTable rows={list} dueDaysDefault={settings?.due_days_default ?? null} />
    </div>
  );
}
