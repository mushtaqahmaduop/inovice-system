import { requireUser } from "@/lib/auth/guards";

// Placeholder — the real dashboard is task 7.1. The shell (task 2.3) owns
// the chrome; this page only fills the content area.
export default async function DashboardPage() {
  const ctx = await requireUser();
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md border border-hairline bg-surface p-8 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
          Phase 2 · App shell
        </p>
        <p className="text-sm leading-relaxed text-ink-2">
          Signed in{ctx.aal === "aal2" ? " with two-factor verification" : ""}. Monthly totals,
          VAT collected and outstanding balances arrive with task 7.1.
        </p>
      </div>
    </div>
  );
}
