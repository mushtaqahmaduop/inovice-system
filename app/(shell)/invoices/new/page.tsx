import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor } from "./invoice-editor";

// New invoice — task 4.1a delivers the line grid + live totals; pickers and
// draft persistence arrive with 4.1b, the issue flow with 4.2. VAT context
// comes from Settings at render time; the totals shown here are display-only
// (issue_invoice() recomputes and snapshots at the sealing moment).
export default async function NewInvoicePage() {
  await requireUser();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("vat_registered, vat_rate_bp, invoice_notes_default, invoice_terms_default")
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <InvoiceEditor
        vatRegistered={settings?.vat_registered ?? true}
        vatRateBp={settings?.vat_rate_bp ?? 500}
      />
    </div>
  );
}
