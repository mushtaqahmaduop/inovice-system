import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Placeholder — the real dashboard is task 7.1; the app shell is task 2.3.
export default async function DashboardPage() {
  const ctx = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-hairline bg-paper px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="mono inline-flex h-6 w-6 items-center justify-center border border-ink text-[10px] font-medium text-ink">
            IL
          </span>
          <span className="text-[15px] font-medium tracking-tight text-ink">Invoice Ledger</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-2">
            {ctx.fullName} <span className="mono text-[10px] text-ink-3 uppercase">{ctx.role}</span>
          </span>
          <ThemeToggle />
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="max-w-md border border-hairline bg-surface p-8 text-center">
          <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            Phase 2 · Auth foundation
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            Signed in{ctx.aal === "aal2" ? " with two-factor verification" : ""}. The app shell
            arrives with task 2.3.
          </p>
        </div>
      </main>
    </div>
  );
}
