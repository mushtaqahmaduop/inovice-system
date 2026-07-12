import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDoc, type DocLine } from "@/components/invoice/invoice-doc";
import { PrintButton } from "./print-button";
import { PrintOnLoad } from "./print-on-load";
import { VoidControls } from "./void-controls";
import { PaymentsPanel, type PaymentRow, type MethodOption } from "./payments-panel";
import { EventTimeline, type EventRow } from "./event-timeline";

// Sealed invoice view (task 4.2). Every number on this page comes from the
// SEALED columns and frozen children — nothing is recomputed from current
// Settings (CLAUDE.md §3.3). Drafts redirect to their editor. Ctrl+P (or
// the Print button) produces the minimal readable A4 page ([#23a]).
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const ctx = await requireUser();
  const { id } = await params;
  const { print } = await searchParams;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `id, status, invoice_number, issue_date, customer_snapshot,
       vat_registered_snapshot, vat_rate_bp_snapshot,
       subtotal_govt, subtotal_service, subtotal_extras, vat_amount, grand_total,
       notes, terms, issued_at, void_reason, issued_by, replaces_invoice_id,
       display_currency, exchange_rate_e6`
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();
  if (invoice.status === "draft") redirect(`/invoices/${id}/edit`);

  // Task 4.4 lineage: what this replaces, and what replaced this.
  const [{ data: replacesTarget }, { data: replacedBy }] = await Promise.all([
    invoice.replaces_invoice_id
      ? supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("id", invoice.replaces_invoice_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("replaces_invoice_id", id)
      .maybeSingle(),
  ]);

  const [
    { data: settings },
    { data: cols },
    { data: lines },
    { data: issuer },
    { data: listRow },
    { data: paymentRows },
    { data: methods },
    { data: eventRows },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from("settings")
      .select("company_name, tagline, trn, address, phone, email, bank_details, paper_size")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("invoice_extra_columns")
      .select("id, label, vatable, position")
      .eq("invoice_id", id)
      .order("position"),
    supabase
      .from("invoice_lines")
      .select(
        "position, description, qty, govt_fee, service_fee, invoice_line_fees(column_id, amount)"
      )
      .eq("invoice_id", id)
      .order("position"),
    invoice.issued_by
      ? supabase.from("profiles").select("full_name").eq("id", invoice.issued_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("invoice_list").select("paid_total, payment_status").eq("id", id).maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, received_on, reference, reverses_payment_id, method_id, created_at")
      .eq("invoice_id", id)
      .order("created_at"),
    supabase.from("payment_methods").select("id, label, is_active").order("position"),
    supabase
      .from("invoice_events")
      .select("id, event_type, created_at, actor_id, payload")
      .eq("invoice_id", id)
      .order("created_at"),
    supabase.from("profiles").select("id, full_name"),
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

  // Task 6.1 (Q-07): the paper size is presentation, not sealed content —
  // the shop can flip A4/A5 in Settings and reprint any invoice. A5 keeps
  // the exact sample layout, scaled to the narrower sheet (130mm vs 182mm
  // of content width → 0.72). Body <style> comes after the global sheet,
  // so its @page wins over the A4 default in globals.css.
  const paper = settings?.paper_size === "A5" ? "A5" : "A4";
  const pageStyle =
    `@page { size: ${paper}; margin: ${paper === "A5" ? "9mm" : "14mm"}; }` +
    (paper === "A5" ? " @media print { .print-doc { zoom: 0.72; } }" : "");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:p-0">
      <style>{pageStyle}</style>
      {print === "1" && invoice.status === "issued" ? <PrintOnLoad invoiceId={invoice.id} /> : null}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2.5">
          <p className="mono text-[14px] font-semibold text-foreground">{invoice.invoice_number}</p>
          {invoice.status === "issued" ? (
            <span className="inline-flex items-center rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-primary">
              Sealed — immutable
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-danger/40 bg-danger-soft px-2.5 py-0.5 text-[12px] font-medium text-danger">
              Voided
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {ctx.role === "admin" && invoice.status === "issued" ? (
            <VoidControls invoiceId={invoice.id} />
          ) : null}
          <PrintButton invoiceId={invoice.id} />
          <Link
            href="/invoices/new"
            className="inline-flex h-8 items-center rounded-[8px] border border-border bg-surface px-3 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-foreground"
          >
            New invoice
          </Link>
        </div>
      </div>

      {replacesTarget || replacedBy ? (
        <div className="mb-4 flex flex-wrap gap-4 print:hidden">
          {replacesTarget ? (
            <Link
              href={`/invoices/${replacesTarget.id}`}
              className="mono text-[11px] text-primary underline-offset-2 hover:underline"
            >
              ← replaces {replacesTarget.invoice_number ?? "voided invoice"}
            </Link>
          ) : null}
          {replacedBy ? (
            <Link
              href={
                replacedBy.status === "draft"
                  ? `/invoices/${replacedBy.id}/edit`
                  : `/invoices/${replacedBy.id}`
              }
              className="mono text-[11px] text-primary underline-offset-2 hover:underline"
            >
              replaced by {replacedBy.invoice_number ?? "a draft"} →
            </Link>
          ) : null}
        </div>
      ) : null}

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
        paymentStatus={listRow?.payment_status ?? null}
        voidReason={invoice.void_reason}
      />

      {invoice.status === "issued" ? (
        <PaymentsPanel
          invoiceId={invoice.id}
          payments={(
            (paymentRows ?? []) as {
              id: string;
              amount: number;
              received_on: string;
              reference: string | null;
              reverses_payment_id: string | null;
              method_id: string;
            }[]
          ).map((p): PaymentRow => ({
            id: p.id,
            amount: p.amount,
            received_on: p.received_on,
            reference: p.reference,
            reverses_payment_id: p.reverses_payment_id,
            method_label: (methods ?? []).find((m) => m.id === p.method_id)?.label ?? "—",
            reversed: (paymentRows ?? []).some((r) => r.reverses_payment_id === p.id),
          }))}
          methods={((methods ?? []).filter((m) => m.is_active) as MethodOption[]).map((m) => ({
            id: m.id,
            label: m.label,
          }))}
          paidTotal={listRow?.paid_total ?? 0}
          grandTotal={invoice.grand_total ?? 0}
          paymentStatus={listRow?.payment_status ?? null}
        />
      ) : null}

      <EventTimeline
        events={(
          (eventRows ?? []) as {
            id: string;
            event_type: string;
            created_at: string;
            actor_id: string | null;
            payload: Record<string, unknown>;
          }[]
        ).map((e): EventRow => ({
          id: e.id,
          event_type: e.event_type,
          created_at: e.created_at,
          actor_name: (profiles ?? []).find((p) => p.id === e.actor_id)?.full_name ?? null,
          payload: e.payload ?? {},
        }))}
      />
    </div>
  );
}
