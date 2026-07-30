import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor, type PickerCustomer, type PickerService } from "../invoice-editor";
import { fetchRecentLines } from "@/lib/invoices/recent-lines";
import { DraftsStrip } from "./drafts-strip";

// New invoice (tasks 4.1a/4.1b). One render, four RLS-scoped reads:
// settings (VAT context + defaults), pickers, and the recent-drafts strip —
// drafts have no number and stay out of global search, so this strip is the
// resume path until the 4.3 list lands.
export default async function NewInvoicePage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const [
    { data: settings },
    { data: customers },
    { data: services },
    { data: methods },
    { data: drafts },
  ] = await Promise.all([
    supabase
      .from("settings")
      .select(
        "vat_registered, vat_rate_bp, invoice_notes_default, invoice_terms_default, company_name, company_name_ar, tagline, tagline_ar, trn, address, address_ar, phone, email, bank_details"
      )
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
    supabase.from("payment_methods").select("id, label").eq("is_active", true).order("position"),
    supabase
      .from("invoices")
      .select("id, created_at, created_by, notes, customers(name)")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const recent = await fetchRecentLines(supabase);

  // Item count per open draft, for the Open Drafts panel (owner mockup
  // 2026-07-30). A separate read rather than a PostgREST embedded aggregate:
  // at most 8 drafts, and this needs no assumptions about aggregate support.
  // Deliberately NO draft number — §3.2 forbids numbering a draft, so the rows
  // are identified by client, date and size.
  const draftIds = (drafts ?? []).map((d) => d.id);
  const { data: draftLineRows } = draftIds.length
    ? await supabase.from("invoice_lines").select("invoice_id").in("invoice_id", draftIds)
    : { data: [] as { invoice_id: string }[] };
  const itemCounts = new Map<string, number>();
  for (const r of draftLineRows ?? []) {
    itemCounts.set(r.invoice_id, (itemCounts.get(r.invoice_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 md:px-8">
      <InvoiceEditor
        vatRegistered={settings?.vat_registered ?? true}
        vatRateBp={settings?.vat_rate_bp ?? 500}
        customers={(customers ?? []) as PickerCustomer[]}
        services={(services ?? []) as PickerService[]}
        methods={(methods ?? []).map((m) => ({ id: m.id, label: m.label }))}
        recent={recent}
        defaultNotes={settings?.invoice_notes_default ?? ""}
        defaultTerms={settings?.invoice_terms_default ?? ""}
        existing={null}
        company={{
          name: settings?.company_name ?? "",
          nameAr: settings?.company_name_ar ?? null,
          tagline: settings?.tagline ?? null,
          taglineAr: settings?.tagline_ar ?? null,
          trn: settings?.trn ?? null,
          address: settings?.address ?? null,
          addressAr: settings?.address_ar ?? null,
          phone: settings?.phone ?? null,
          email: settings?.email ?? null,
          bankDetails: settings?.bank_details ?? null,
        }}
      />

      <DraftsStrip
        drafts={(drafts ?? []).map((d) => ({
          id: d.id,
          created_at: d.created_at,
          created_by: d.created_by ?? null,
          customer_name: (d.customers as unknown as { name: string } | null)?.name ?? "—",
          item_count: itemCounts.get(d.id) ?? 0,
        }))}
        viewerId={ctx.userId}
        viewerIsAdmin={ctx.role === "admin"}
      />
    </div>
  );
}
