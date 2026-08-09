import { ChevronRight } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdminAal2 } from "@/lib/auth/guards";
import { UsersManager } from "./users-manager";

export type UserRow = {
  id: string;
  full_name: string;
  role: "admin" | "staff";
  is_active: boolean;
  phone: string | null;
  must_change_password: boolean;
  archived_at: string | null;
  created_at: string;
  email: string | null;
  last_sign_in_at: string | null;
  totp_enabled: boolean;
  session_count: number;
  last_seen: string | null;
};

// User management (task 2.2, D-18/D-19). The admin layout already gates
// admin+aal2; requireAdminAal2 here keeps the page safe standalone too.
//
// This reads through `db` rather than the user-scoped Supabase client because
// half of what the console shows lives in the auth schema — email, last
// sign-in, TOTP factors, live sessions — which PostgREST does not expose at
// all. Same shape as the service-role exception in lib/auth/admin-api.ts:
// authority is decided by the verified session ABOVE this line, and the
// connection is only the means of reading once that has passed.
export default async function UsersPage() {
  const ctx = await requireAdminAal2();

  const rows = await db.execute<UserRow>(sql`
    select
      p.id,
      p.full_name,
      p.role,
      p.is_active,
      p.phone,
      p.must_change_password,
      p.archived_at,
      p.created_at,
      u.email,
      u.last_sign_in_at,
      exists (
        select 1 from auth.mfa_factors f
        where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified'
      ) as totp_enabled,
      (
        select count(*)::int from auth.sessions s
        where s.user_id = p.id and (s.not_after is null or s.not_after > now())
      ) as session_count,
      (
        select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s
        where s.user_id = p.id and (s.not_after is null or s.not_after > now())
      ) as last_seen
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by p.created_at asc
  `);

  return (
    <div className="w-full px-5 py-5 md:px-8">
      <header className="mb-5">
        <nav className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-text-tertiary uppercase">
          <span>Admin</span>
          <ChevronRight className="size-3" />
          <span className="text-text-secondary">Users</span>
        </nav>
        <p className="text-[13px] leading-[19px] text-text-secondary">
          Manage user accounts, roles, permissions and security.
        </p>
      </header>
      <UsersManager rows={Array.from(rows) as UserRow[]} selfId={ctx.userId} />
    </div>
  );
}
