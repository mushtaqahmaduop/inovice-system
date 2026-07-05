import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  InvoiceEditor,
  type ExistingDraft,
  type PickerCustomer,
  type PickerService,
} from "../../invoice-editor";

// Resume a draft (task 4.1b). Sealed invoices are not editable — this page
// shows a lock notice instead of the editor (their real detail view is
// 4.3/5.3); the DB would reject any edit regardless.
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, customer_id, issue_date, notes, terms, invoice_number")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  if (invoice.status !== "draft") {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md border border-hairline bg-surface p-8 text-center">
          <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            {invoice.invoice_number ?? "Invoice"} · {invoice.status}
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            This invoice is sealed and cannot be edited. Corrections happen via a new document.
            The detail view arrives with tasks 4.3/5.3.
          </p>
          <Link
            href="/invoices/new"
            className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            ← New invoice
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: settings }, { data: customers }, { data: services }, { data: cols }, { data: lines }] =
    await Promise.all([
      supabase
        .from("settings")
        .select("vat_registered, vat_rate_bp, invoice_notes_default, invoice_terms_default")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id, name, type, trn, phone, address")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("services")
        .select("id, name, unit, govt_fee, service_fee")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("invoice_extra_columns")
        .select("id, label, vatable, position")
        .eq("invoice_id", id)
        .order("position"),
      supabase
        .from("invoice_lines")
        .select("id, position, description, qty, govt_fee, service_fee, invoice_line_fees(column_id, amount)")
        .eq("invoice_id", id)
        .order("position"),
    ]);

  const columnList = cols ?? [];
  const colIndexById = new Map(columnList.map((c, i) => [c.id, i]));

  const existing: ExistingDraft = {
    id: invoice.id,
    customerId: invoice.customer_id,
    issueDate: invoice.issue_date,
    notes: invoice.notes,
    terms: invoice.terms,
    columns: columnList.map((c) => ({ label: c.label, vatable: c.vatable })),
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      qty: l.qty,
      govtFee: l.govt_fee,
      serviceFee: l.service_fee,
      extraFees: Object.fromEntries(
        ((l.invoice_line_fees as { column_id: string; amount: number }[]) ?? [])
          .filter((f) => colIndexById.has(f.column_id))
          .map((f) => [String(colIndexById.get(f.column_id)), f.amount])
      ),
    })),
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <InvoiceEditor
        vatRegistered={settings?.vat_registered ?? true}
        vatRateBp={settings?.vat_rate_bp ?? 500}
        customers={(customers ?? []) as PickerCustomer[]}
        services={(services ?? []) as PickerService[]}
        defaultNotes={settings?.invoice_notes_default ?? ""}
        defaultTerms={settings?.invoice_terms_default ?? ""}
        existing={existing}
      />
    </div>
  );
}
