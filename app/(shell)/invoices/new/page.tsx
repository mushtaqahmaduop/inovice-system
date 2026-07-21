import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor, type PickerCustomer, type PickerService } from "../invoice-editor";
import { fetchRecentLines } from "@/lib/invoices/recent-lines";

// Dates per PREMIUM_EXECUTION_GUIDE §2.3 — "07 Jul 2026", mono, business
// timezone (the server clock is UTC on Vercel).
function fmtDraftDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
  return `${date}, ${time}`;
}

// New invoice (tasks 4.1a/4.1b). One render, four RLS-scoped reads:
// settings (VAT context + defaults), pickers, and the recent-drafts strip —
// drafts have no number and stay out of global search, so this strip is the
// resume path until the 4.3 list lands.
export default async function NewInvoicePage() {
  await requireUser();
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
      .select("id, created_at, notes, customers(name)")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const recent = await fetchRecentLines(supabase);

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

      {(drafts ?? []).length > 0 ? (
        <div className="mt-12 border-t border-border pt-6">
          <p className="mb-3 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
            Open drafts
          </p>
          <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-surface">
            {(drafts ?? []).map((d) => (
              <Link
                key={d.id}
                href={`/invoices/${d.id}/edit`}
                className="flex items-center gap-3 px-4 py-2.5 text-[13px] leading-[19px] text-foreground transition-colors hover:bg-bg-sunken"
              >
                <span className="min-w-0 flex-1 truncate">
                  {(d.customers as unknown as { name: string } | null)?.name ?? "—"}
                </span>
                <span className="mono text-[13px] text-text-tertiary">
                  {fmtDraftDate(d.created_at)}
                </span>
                <span className="text-[13px] text-text-secondary">Resume →</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
