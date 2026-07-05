import { requireAdminAal2 } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { UsersManager } from "./users-manager";

// User management (task 2.2, D-18/D-19). The admin layout already gates
// admin+aal2; requireAdminAal2 here keeps the page safe standalone too.
export default async function UsersPage() {
  const ctx = await requireAdminAal2();
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
          Admin · Users
        </p>
        <h1 className="mb-8 text-[15px] font-medium tracking-tight text-ink">
          Accounts & sessions
        </h1>
        <UsersManager profiles={profiles ?? []} selfId={ctx.userId} />
      </div>
    </div>
  );
}
