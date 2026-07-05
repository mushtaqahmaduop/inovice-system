import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { CustomersView } from "./customers-view";

export type CustomerRow = {
  id: string;
  type: "regular" | "walk_in";
  name: string;
  phone: string | null;
  email: string | null;
  trn: string | null;
  address: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
};

// Customers (task 3.1). One RLS-scoped query for the whole list — the shop
// is ~hundreds of customers, so the table filters/sorts client-side
// (TanStack); revisit with keyset pagination only if this ever grows teeth.
export default async function CustomersPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, type, name, phone, email, trn, address, notes, deleted_at, created_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as CustomerRow[];
  // Staff never see soft-deleted rows; admins get a toggle for them.
  const visible = ctx.role === "admin" ? rows : rows.filter((r) => r.deleted_at === null);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-[20px] font-semibold tracking-tight text-ink">Customers</h1>
      <CustomersView rows={visible} isAdmin={ctx.role === "admin"} />
    </div>
  );
}
