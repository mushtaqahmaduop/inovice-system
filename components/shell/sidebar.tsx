"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INVOICES_CHANNEL, INVOICES_CHANGED_EVENT } from "@/lib/realtime";
import { NAV_SECTIONS, type NavItem } from "./nav-items";

// Prototype line icons (16×16, stroke 1.4) ported 1:1 from
// reference/invoice_system_v2.html.
const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  dashboard: (
    <>
      <rect x="2" y="2.5" width="5" height="5" />
      <rect x="9" y="2.5" width="5" height="5" />
      <rect x="2" y="9.5" width="5" height="4" />
      <rect x="9" y="9.5" width="5" height="4" />
    </>
  ),
  invoices: (
    <>
      <path d="M3 2h7l3 3v9H3z" />
      <path d="M10 2v3h3M5 8h6M5 11h6" />
    </>
  ),
  plus: <path d="M8 2v12M2 8h12" />,
  customers: (
    <>
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
    </>
  ),
  services: <path d="M2 3.5h12M2 8h12M2 12.5h12" />,
  users: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="11.5" cy="7" r="1.8" />
      <path d="M2 13c0-2 2-3.5 4-3.5s4 1.5 4 3.5M9 13c0-1.5 1.3-2.5 2.5-2.5S14 11.5 14 13" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
    </>
  ),
};

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  return (
    <span className="h-4 w-4 shrink-0 text-current">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        {ICONS[icon]}
      </svg>
    </span>
  );
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

// Small mono count badge (DESIGN_BRIEF §3 problem 9). Color contract as in
// status-chip: burnt orange is overdue-only, drafts stay neutral.
function CountBadge({ kind, value }: { kind: NonNullable<NavItem["countKey"]>; value: number }) {
  if (value <= 0) return null;
  return (
    <span
      className={
        kind === "overdue"
          ? "mono min-w-4 rounded-[8px] border border-warning bg-warning px-1 text-center text-[9px] leading-4 text-surface"
          : "mono min-w-4 rounded-[8px] border border-hairline-strong bg-surface-2 px-1 text-center text-[9px] leading-4 text-ink-3"
      }
      title={kind === "overdue" ? `${value} overdue` : `${value} open draft${value === 1 ? "" : "s"}`}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

export function Sidebar({ role }: { role: "admin" | "staff" }) {
  const pathname = usePathname();
  const counts = useNavCounts(pathname);

  return (
    // DESIGN_BRIEF §3 #9: full 208px sidebar at md+, collapsed 64px icon
    // rail below — small screens keep navigation instead of losing it.
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-hairline bg-surface md:w-52 print:!hidden">
      <div className="border-b border-hairline px-2 py-4 md:px-4">
        <div className="flex items-center justify-center gap-3 md:justify-start">
          <span className="mono inline-flex h-8 w-8 shrink-0 items-center justify-center border border-ink text-[10px] font-bold text-ink outline outline-offset-2 outline-ink/40">
            IL
          </span>
          <div className="hidden min-w-0 md:block">
            <span className="block text-[14px] font-semibold tracking-tight text-ink">
              Invoice Ledger
            </span>
            <span className="mono block text-[8px] tracking-[0.2em] text-ink-3 uppercase">
              Official Registry
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.filter((s) => !s.adminOnly || role === "admin").map((section) => (
          <div key={section.label} className="mb-4">
            <p className="mono hidden px-2 pb-1.5 text-[9px] tracking-[0.16em] text-ink-3 uppercase md:block">
              {section.label}
            </p>
            {section.items
              .filter((item) => !item.adminOnly || role === "admin")
              .map((item) => {
                const active =
                  pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                if (item.task) {
                  // Placeholder — page lands with the tagged task. Inert on
                  // purpose: no dead links in the shell.
                  return (
                    <span
                      key={item.href}
                      className="flex cursor-default items-center justify-center gap-2.5 px-2 py-1.5 text-[13px] text-ink-4 md:justify-start"
                      aria-disabled="true"
                      title={`${item.label} — arrives with task ${item.task}`}
                    >
                      <NavIcon icon={item.icon} />
                      <span className="hidden flex-1 md:block">{item.label}</span>
                      <span className="mono hidden text-[9px] tracking-[0.08em] text-ink-4 md:inline">
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
                      active
                        ? "relative flex items-center justify-center gap-2.5 border-l-2 border-primary bg-accent px-2 py-1.5 text-[13px] font-medium text-ink md:justify-start"
                        : "relative flex items-center justify-center gap-2.5 border-l-2 border-transparent px-2 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-accent hover:text-ink md:justify-start"
                    }
                  >
                    <NavIcon icon={item.icon} />
                    <span className="hidden flex-1 md:block">{item.label}</span>
                    {item.countKey ? (
                      // In the rail the badge rides the icon's corner; at
                      // md+ it sits in flow at the row's right edge.
                      <span className="absolute top-0 right-0.5 md:static">
                        <CountBadge kind={item.countKey} value={counts[item.countKey]} />
                      </span>
                    ) : null}
                    {item.adminOnly ? (
                      <span className="mono hidden text-[9px] tracking-[0.08em] text-primary md:inline">
                        ADM
                      </span>
                    ) : null}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-hairline px-4 py-3 md:block">
        <p className="mono text-[9px] tracking-[0.14em] text-ink-4 uppercase">Stamped Paper</p>
      </div>
    </aside>
  );
}
