import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor, type PickerCustomer, type PickerService } from "../invoice-editor";

// New invoice (tasks 4.1a/4.1b). One render, four RLS-scoped reads:
// settings (VAT context + defaults), pickers, and the recent-drafts strip —
// drafts have no number and stay out of global search, so this strip is the
// resume path until the 4.3 list lands.
export default async function NewInvoicePage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: settings }, { data: customers }, { data: services }, { data: drafts }] =
    await Promise.all([
      supabase
        .from("settings")
        .select(
          "vat_registered, vat_rate_bp, invoice_notes_default, invoice_terms_default, company_name, tagline, trn, address, phone, email, bank_details"
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
      supabase
        .from("invoices")
        .select("id, created_at, notes, customers(name)")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <InvoiceEditor
        vatRegistered={settings?.vat_registered ?? true}
        vatRateBp={settings?.vat_rate_bp ?? 500}
        customers={(customers ?? []) as PickerCustomer[]}
        services={(services ?? []) as PickerService[]}
        defaultNotes={settings?.invoice_notes_default ?? ""}
        defaultTerms={settings?.invoice_terms_default ?? ""}
        existing={null}
        company={{
          name: settings?.company_name ?? "",
          tagline: settings?.tagline ?? null,
          trn: settings?.trn ?? null,
          address: settings?.address ?? null,
          phone: settings?.phone ?? null,
          email: settings?.email ?? null,
          bankDetails: settings?.bank_details ?? null,
        }}
      />

      {(drafts ?? []).length > 0 ? (
        <div className="mt-10 border-t border-hairline pt-5">
          <p className="mono mb-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Open drafts</p>
          <div className="divide-y divide-hairline border border-hairline bg-surface">
            {(drafts ?? []).map((d) => (
              <Link
                key={d.id}
                href={`/invoices/${d.id}/edit`}
                className="flex items-center gap-3 px-3 py-2 text-[12.5px] text-ink hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">
                  {(d.customers as unknown as { name: string } | null)?.name ?? "—"}
                </span>
                <span className="mono text-[10px] text-ink-3">
                  {new Date(d.created_at).toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                  draft →
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
