import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { settingsUpdateSchema } from "@/lib/validation/settings";

// Update the single settings row (task 3.2). Admin aal2 only; RLS backs
// this up (settings UPDATE is admin-only in the §5 matrix). The VAT toggle
// here affects FUTURE invoices only — issued invoices carry their own
// vat snapshots written by issue_invoice(), never recomputed (D-16).
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const s = parsed.data;

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (readError || !existing) {
    return NextResponse.json({ error: "Settings row missing — run the seed." }, { status: 500 });
  }

  const { error } = await supabase
    .from("settings")
    .update({
      company_name: s.companyName,
      company_name_ar: s.companyNameAr,
      tagline: s.tagline,
      trn: s.trn,
      address: s.address,
      phone: s.phone,
      email: s.email,
      bank_details: s.bankDetails,
      vat_registered: s.vatRegistered,
      vat_rate_bp: s.vatRateBp,
      invoice_number_format: s.invoiceNumberFormat,
      paper_size: s.paperSize,
      invoice_notes_default: s.invoiceNotesDefault,
      invoice_terms_default: s.invoiceTermsDefault,
      due_days_default: s.dueDaysDefault,
      updated_at: new Date().toISOString(),
      updated_by: guard.ctx.userId, // session-derived, never client-supplied
    })
    .eq("id", existing.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
