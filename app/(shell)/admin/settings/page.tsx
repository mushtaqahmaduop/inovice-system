import { requireAdminAal2 } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import { PaymentMethodsManager } from "./payment-methods";

export type SettingsRow = {
  id: string;
  company_name: string;
  company_name_ar: string | null;
  tagline: string | null;
  trn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_details: string | null;
  vat_registered: boolean;
  vat_rate_bp: number;
  invoice_number_format: string;
  paper_size: string;
  invoice_notes_default: string | null;
  invoice_terms_default: string | null;
  due_days_default: number | null;
};

export type PaymentMethodRow = {
  id: string;
  label: string;
  is_active: boolean;
  position: number;
};

// Settings (task 3.2) — admin only (layout + this guard). Values stay
// client-variable (Q-02/Q-03/Q-07); logo upload lands with print (6.1).
export default async function SettingsPage() {
  await requireAdminAal2();
  const supabase = await createClient();
  const [{ data: settings }, { data: methods }] = await Promise.all([
    supabase.from("settings").select("*").limit(1).maybeSingle(),
    supabase.from("payment_methods").select("id, label, is_active, position").order("position"),
  ]);

  if (!settings) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-sm text-danger">Settings row missing — run the seed.</p>
      </div>
    );
  }

  return (
    <div className="w-full px-5 py-5 md:px-8">
      <header className="mb-5">
        <h1 className="text-[22px] leading-7 font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Company details and invoicing defaults.
        </p>
      </header>
      <div className="space-y-6">
        <SettingsForm settings={settings as SettingsRow} />
        <PaymentMethodsManager methods={(methods ?? []) as PaymentMethodRow[]} />
      </div>
    </div>
  );
}
