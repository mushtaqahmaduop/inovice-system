import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ServicesView } from "./services-view";

export type ServiceRow = {
  id: string;
  name: string;
  unit: string;
  govt_fee: number;
  service_fee: number;
  is_active: boolean;
  deleted_at: string | null;
};

// Services catalogue (task 3.3, [#25]) — staff read, admin edit (RLS §5).
// These unit fees drive the 4.1b invoice-form picker; staff can override
// on any invoice line, only admins change the catalogue defaults.
export default async function ServicesPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, unit, govt_fee, service_fee, is_active, deleted_at")
    .order("name");

  const rows = (data ?? []) as ServiceRow[];
  const visible = ctx.role === "admin" ? rows : rows.filter((r) => r.deleted_at === null);
  const activeCount = rows.filter((r) => r.deleted_at === null).length;

  return (
    <div className="w-full px-5 py-6 md:px-8">
      <header className="mb-6 flex items-center gap-2.5">
        <h1 className="text-[22px] leading-7 font-semibold text-foreground">Services</h1>
        <span className="mono rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-primary">
          {activeCount}
        </span>
      </header>
      <ServicesView rows={visible} isAdmin={ctx.role === "admin"} />
    </div>
  );
}
