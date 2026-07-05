import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { PageTitle } from "@/components/shell/page-title";
import { GlobalSearch } from "@/components/shell/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// App shell (task 2.3): sidebar + topbar around every authenticated page.
// The (shell) group leaves URLs untouched — middleware rules keep working.
// requireUser here is defense in depth behind the middleware; /admin/* has
// its own stricter layout guard inside.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  // Stamp-style document reference (prototype top-right): LDG/YYYY/MM/DD.
  const now = new Date();
  const docRef = `LDG/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar role={ctx.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-hairline bg-paper px-6 print:hidden">
          <div className="flex min-w-0 items-baseline gap-3">
            <PageTitle />
            <span className="mono hidden text-[10px] tracking-[0.08em] text-ink-3 sm:inline">
              {docRef}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <GlobalSearch />
            <ThemeToggle />
            <span className="hidden items-center gap-1.5 text-xs text-ink-2 md:inline-flex">
              {ctx.fullName}
              <span className="mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {ctx.role}
              </span>
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
