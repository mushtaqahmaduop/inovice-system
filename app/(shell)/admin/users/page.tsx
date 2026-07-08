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
    <div className="w-full px-5 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-[22px] leading-7 font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Accounts, roles and access for your team.
        </p>
      </header>
      <div className="max-w-3xl">
        <UsersManager profiles={profiles ?? []} selfId={ctx.userId} />
      </div>
    </div>
  );
}
