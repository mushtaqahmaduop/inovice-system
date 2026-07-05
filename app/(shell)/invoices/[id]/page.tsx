import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDoc, type DocLine } from "@/components/invoice/invoice-doc";
import { PrintButton } from "./print-button";

// Sealed invoice view (task 4.2). Every number on this page comes from the
// SEALED columns and frozen children — nothing is recomputed from current
// Settings (CLAUDE.md §3.3). Drafts redirect to their editor. Ctrl+P (or
// the Print button) produces the minimal readable A4 page ([#23a]).
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `id, status, invoice_number, issue_date, customer_snapshot,
       vat_registered_snapshot, vat_rate_bp_snapshot,
       subtotal_govt, subtotal_service, subtotal_extras, vat_amount, grand_total,
       notes, terms, issued_at, void_reason, issued_by`
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();
  if (invoice.status === "draft") redirect(`/invoices/${id}/edit`);

  const [{ data: settings }, { data: cols }, { data: lines }, { data: issuer }] =
    await Promise.all([
      supabase
        .from("settings")
        .select("company_name, tagline, trn, address, phone, email, bank_details")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("invoice_extra_columns")
        .select("id, label, vatable, position")
        .eq("invoice_id", id)
        .order("position"),
      supabase
        .from("invoice_lines")
        .select("position, description, qty, govt_fee, service_fee, invoice_line_fees(column_id, amount)")
        .eq("invoice_id", id)
        .order("position"),
      invoice.issued_by
        ? supabase.from("profiles").select("full_name").eq("id", invoice.issued_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const columnList = cols ?? [];
  const colIndexById = new Map(columnList.map((c, i) => [c.id, i]));
  const docLines: DocLine[] = (lines ?? []).map((l) => {
    const extraFees = new Array<number>(columnList.length).fill(0);
    for (const f of (l.invoice_line_fees as { column_id: string; amount: number }[]) ?? []) {
      const idx = colIndexById.get(f.column_id);
      if (idx !== undefined) extraFees[idx] = f.amount;
    }
    return {
      description: l.description,
      qty: l.qty,
      govtFee: l.govt_fee,
      serviceFee: l.service_fee,
      extraFees,
    };
  });

  const snapshot = (invoice.customer_snapshot ?? {}) as {
    name?: string;
    trn?: string;
    phone?: string;
    address?: string;
  };
  const vatRegistered = invoice.vat_registered_snapshot ?? false;
  const ratePct = ((invoice.vat_rate_bp_snapshot ?? 0) / 100).toString();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-baseline gap-3">
          <p className="mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            {invoice.invoice_number} ·{" "}
            {invoice.status === "issued" ? "sealed" : invoice.status}
          </p>
          {invoice.status === "issued" ? (
            <span className="mono border border-hairline-strong px-1.5 py-0.5 text-[9px] tracking-[0.14em] text-ink-2 uppercase">
              ⬒ Sealed — immutable
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <PrintButton invoiceId={invoice.id} />
          <Link
            href="/invoices/new"
            className="inline-flex h-8 items-center border border-hairline-strong bg-surface px-3 text-xs text-ink-2 hover:text-ink"
          >
            New invoice
          </Link>
        </div>
      </div>

      <InvoiceDoc
        company={{
          name: settings?.company_name ?? "",
          tagline: settings?.tagline ?? null,
          trn: settings?.trn ?? null,
          address: settings?.address ?? null,
          phone: settings?.phone ?? null,
          email: settings?.email ?? null,
          bankDetails: settings?.bank_details ?? null,
        }}
        vatRegistered={vatRegistered}
        ratePct={ratePct}
        number={invoice.invoice_number}
        status={invoice.status as "issued" | "voided"}
        issueDate={invoice.issue_date}
        billTo={{
          name: snapshot.name ?? "—",
          trn: snapshot.trn ?? null,
          phone: snapshot.phone ?? null,
          address: snapshot.address ?? null,
        }}
        columns={columnList.map((c) => ({ label: c.label, vatable: c.vatable }))}
        lines={docLines}
        totals={{
          subtotalGovt: invoice.subtotal_govt ?? 0,
          subtotalService: invoice.subtotal_service ?? 0,
          subtotalExtras: invoice.subtotal_extras ?? 0,
          vatAmount: invoice.vat_amount ?? 0,
          grandTotal: invoice.grand_total ?? 0,
        }}
        notes={invoice.notes}
        terms={invoice.terms}
        issuedByName={(issuer as { full_name: string } | null)?.full_name ?? null}
        issuedAt={invoice.issued_at}
        voidReason={invoice.void_reason}
      />
    </div>
  );
}
