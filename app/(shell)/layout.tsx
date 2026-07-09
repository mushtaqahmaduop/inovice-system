import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { PageTitle } from "@/components/shell/page-title";
import { GlobalSearch } from "@/components/shell/global-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { Toaster } from "@/components/ui/toast";

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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={ctx.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 md:gap-4 md:px-6 print:hidden">
          <div className="flex min-w-0 shrink-0 items-baseline gap-3">
            <PageTitle />
          </div>
          <div className="flex flex-1 justify-end md:justify-center">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <ThemeToggle />
            <UserMenu name={ctx.fullName} role={ctx.role} signOut={signOut} />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
        <footer className="flex shrink-0 items-center justify-between border-t border-border px-5 py-4 text-[12px] text-text-tertiary md:px-8 print:hidden">
          <span>© 2026 Prestige Land. All rights reserved.</span>
          <span className="mono">Version 1.0.0</span>
        </footer>
      </div>
      <Toaster />
    </div>
  );
}
