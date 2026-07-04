import Link from "next/link";

// Admin index — settings arrives with task 3.2. Reaching anything under
// /admin requires admin role + MFA (middleware + layout guard).
export default function AdminPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="max-w-md border border-hairline bg-surface p-8 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">Admin</p>
        <Link href="/admin/users" className="text-sm text-primary underline-offset-2 hover:underline">
          Accounts & sessions →
        </Link>
      </div>
    </div>
  );
}
