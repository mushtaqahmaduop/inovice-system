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
        <p className="text-sm text-destructive">Settings row missing — run the seed.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
        Admin · Settings
      </p>
      <h1 className="mb-6 text-[15px] font-medium tracking-tight text-ink">Company & invoicing</h1>
      <SettingsForm settings={settings as SettingsRow} />
      <div className="mt-10">
        <PaymentMethodsManager methods={(methods ?? []) as PaymentMethodRow[]} />
      </div>
    </div>
  );
}
