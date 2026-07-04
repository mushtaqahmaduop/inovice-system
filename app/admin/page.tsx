// Placeholder admin surface — user management lands with task 2.2,
// settings with 3.2. Exists now so the 2.1 route-guard tests have a real
// admin route to probe.
export default function AdminPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="max-w-md border border-hairline bg-surface p-8 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
          Admin · placeholder
        </p>
        <p className="text-sm text-ink-2">Admin area. Reaching this page requires admin + MFA.</p>
      </div>
    </div>
  );
}
