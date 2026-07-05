import { requireAdminAal2 } from "@/lib/auth/guards";

// Defense in depth behind the middleware: every /admin/* render re-verifies
// admin role + aal2 server-side. Staff and half-authenticated admins never
// reach children of this layout.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminAal2();
  return <>{children}</>;
}
