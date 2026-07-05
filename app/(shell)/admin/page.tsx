import Link from "next/link";

// Admin index. Reaching anything under /admin requires admin role + MFA
// (middleware + layout guard).
export default function AdminPage() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-2 border border-hairline bg-surface p-8 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">Admin</p>
        <Link href="/admin/users" className="text-sm text-primary underline-offset-2 hover:underline">
          Accounts & sessions →
        </Link>
        <Link href="/admin/settings" className="text-sm text-primary underline-offset-2 hover:underline">
          Company & invoicing settings →
        </Link>
      </div>
    </div>
  );
}
