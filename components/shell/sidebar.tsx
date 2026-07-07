"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  LayoutDashboard,
  List,
  Plus,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { INVOICES_CHANNEL, INVOICES_CHANGED_EVENT } from "@/lib/realtime";
import { NAV_SECTIONS, type NavItem } from "./nav-items";

// Lucide only (DESIGN_SYSTEM §6): 16px, stroke 1.75, inherits text color.
const ICONS: Record<NavItem["icon"], LucideIcon> = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  plus: Plus,
  customers: Users,
  services: List,
  users: UserCog,
  settings: Settings,
};

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />;
}

type NavCounts = { overdue: number; drafts: number };

// Sidebar counts + the app's ONE realtime subscriber (task 6.3 R-5,
// broadcast-refetch). It lives here — not per page — because realtime-js
// reuses a channel instance per topic on the singleton browser client, so
// a second subscriber's unmount cleanup would tear the shared channel down
// under the first. The sidebar is always mounted, so it owns the channel:
// on a broadcast it refetches the badge counts AND router.refresh()es the
// current route (debounced), which keeps /invoices and every other server
// component live through the caller's own RLS.
function useNavCounts(pathname: string): NavCounts {
  const router = useRouter();
  const [counts, setCounts] = useState<NavCounts>({ overdue: 0, drafts: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/nav-counts", { cache: "no-store" });
      if (res.ok) setCounts((await res.json()) as NavCounts);
    } catch {
      // Badge-only data — a missed fetch just means a stale count.
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [pathname, refetch]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(INVOICES_CHANNEL)
      .on("broadcast", { event: INVOICES_CHANGED_EVENT }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          router.refresh();
          void refetch();
        }, 400);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, refetch]);

  return counts;
}

// Count badge per §2.3 — soft bg + strong text, never solid-filled.
// Color contract survives: burnt orange (danger family) is overdue-only.
function CountBadge({ kind, value }: { kind: NonNullable<NavItem["countKey"]>; value: number }) {
  if (value <= 0) return null;
  return (
    <span
      className={
        kind === "overdue"
          ? "mono min-w-[18px] rounded-full border border-danger/40 bg-danger-soft px-1.5 text-center text-[11px] leading-[17px] text-danger"
          : "mono min-w-[18px] rounded-full border border-border-strong bg-neutral-soft px-1.5 text-center text-[11px] leading-[17px] text-text-secondary"
      }
      title={
        kind === "overdue" ? `${value} overdue` : `${value} open draft${value === 1 ? "" : "s"}`
      }
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

export function Sidebar({ role }: { role: "admin" | "staff" }) {
  const pathname = usePathname();
  const counts = useNavCounts(pathname);

  return (
    // §4.1: 240px sidebar on --bg-sunken with a right hairline; below md it
    // collapses to a 64px icon rail — small screens keep navigation.
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-bg-sunken md:w-60 print:!hidden">
      <div className="px-2 pt-5 pb-2 md:px-4">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-start"
        >
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-on-accent">
            P
          </span>
          <span className="hidden min-w-0 truncate text-[14px] font-semibold tracking-tight text-foreground md:block">
            Prestige Land
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_SECTIONS.filter((s) => !s.adminOnly || role === "admin").map((section) => (
          <div key={section.label} className="mb-3">
            <p className="mt-3 hidden px-3 pb-1 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase md:block">
              {section.label}
            </p>
            {section.items
              .filter((item) => !item.adminOnly || role === "admin")
              .map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href + "/"));
                if (item.task) {
                  // Placeholder — page lands with the tagged task. Inert on
                  // purpose: no dead links in the shell.
                  return (
                    <span
                      key={item.href}
                      className="flex h-[34px] cursor-default items-center justify-center gap-2.5 rounded-full px-3 text-[14px] text-text-tertiary md:justify-start"
                      aria-disabled="true"
                      title={`${item.label} — arrives with task ${item.task}`}
                    >
                      <NavIcon icon={item.icon} />
                      <span className="hidden flex-1 md:block">{item.label}</span>
                      <span className="mono hidden text-[10px] tracking-[0.08em] text-text-tertiary md:inline">
                        {item.task}
                      </span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={
                      // §5.5: full-width pill, 34px; active = soft-gray pill
                      // (NOT a blue fill), hover = neutral-soft.
                      active
                        ? "relative flex h-[34px] items-center justify-center gap-2.5 rounded-full bg-nav-active px-3 text-[14px] font-[550] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:justify-start"
                        : "relative flex h-[34px] items-center justify-center gap-2.5 rounded-full px-3 text-[14px] font-medium text-text-secondary transition-colors duration-150 outline-none hover:bg-neutral-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:justify-start"
                    }
                  >
                    <NavIcon icon={item.icon} />
                    <span className="hidden flex-1 truncate md:block">{item.label}</span>
                    {item.countKey ? (
                      // In the rail the badge rides the icon's corner; at
                      // md+ it sits in flow at the row's right edge.
                      <span className="absolute top-0 right-0.5 md:static">
                        <CountBadge kind={item.countKey} value={counts[item.countKey]} />
                      </span>
                    ) : null}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
