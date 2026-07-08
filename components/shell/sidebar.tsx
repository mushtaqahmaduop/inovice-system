"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  HelpCircle,
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

// Brand mark — navy badge, gold crown over a "PL" monogram (owner's logo
// direction, logoo.png). Hand-built placeholder until the final logo asset
// lands; the navy/gold are intentionally literal brand colors, not design
// tokens (same exception as the print document and the MFA QR).
function BrandMark() {
  return (
    <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#16233f" />
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        fill="none"
        stroke="#2a3c63"
        strokeWidth="1"
      />
      {/* three-peak crown */}
      <path
        d="M12.5 17.5 L12.5 12 L16.25 15 L20 10.5 L23.75 15 L27.5 12 L27.5 17.5 Z"
        fill="#d9a441"
      />
      {/* PL monogram */}
      <text
        x="20"
        y="32"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        fontWeight="700"
        letterSpacing="-1.5"
        fill="#d9a441"
      >
        PL
      </text>
    </svg>
  );
}

export function Sidebar({ role }: { role: "admin" | "staff" }) {
  const pathname = usePathname();
  const counts = useNavCounts(pathname);

  // Desktop collapse to the icon rail (persisted). Below md the sidebar is
  // always the rail, so the toggle only matters at md+.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar:collapsed") === "1");
    } catch {
      // localStorage unavailable — default expanded.
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sidebar:collapsed", next ? "1" : "0");
      } catch {
        // persistence is best-effort
      }
      return next;
    });
  }, []);

  // Label visibility: hidden in the rail (mobile) and when collapsed; shown
  // at md+ only when expanded.
  const label = collapsed ? "hidden" : "hidden md:block";
  const labelInline = collapsed ? "hidden" : "hidden md:inline";
  const rowJustify = collapsed ? "justify-center" : "justify-center md:justify-start";

  return (
    // §4.1: sidebar on --bg-sunken with a right hairline; below md it is a
    // 64px icon rail, at md+ it expands to 240px unless collapsed.
    <aside
      data-collapsed={collapsed}
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-bg-sunken print:!hidden ${
        collapsed ? "w-16" : "w-16 md:w-60"
      }`}
    >
      <div className="px-2 pt-4 pb-2 md:px-3">
        <div
          className={`flex items-center gap-2 rounded-[12px] ${
            collapsed ? "" : "md:border md:border-border md:bg-surface md:p-2"
          }`}
        >
          <Link
            href="/dashboard"
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${rowJustify}`}
          >
            <BrandMark />
            <span className={`min-w-0 flex-1 ${label}`}>
              <span className="block truncate text-[15px] leading-5 font-semibold tracking-tight text-foreground">
                Prestige Land
              </span>
              <span className="block truncate text-[13px] leading-4 font-medium text-primary">
                Typing Center
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden size-7 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-neutral-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            <ChevronsLeft className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <p className={`mt-2 px-1 text-[11px] leading-4 text-text-tertiary ${label}`}>
          Business Services · Government Transactions · Clearance & Follow-up
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_SECTIONS.filter((s) => !s.adminOnly || role === "admin").map((section) => (
          <div key={section.label} className="mb-3">
            <p
              className={`mt-3 px-3 pb-1 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase ${label}`}
            >
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
                      className={`flex h-[34px] cursor-default items-center gap-2.5 rounded-full px-3 text-[14px] text-text-tertiary ${rowJustify}`}
                      aria-disabled="true"
                      title={`${item.label} — arrives with task ${item.task}`}
                    >
                      <NavIcon icon={item.icon} />
                      <span className={`flex-1 ${label}`}>{item.label}</span>
                      <span
                        className={`mono text-[10px] tracking-[0.08em] text-text-tertiary ${labelInline}`}
                      >
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
                        ? `relative flex h-[34px] items-center gap-2.5 rounded-full bg-nav-active px-3 text-[14px] font-[550] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${rowJustify}`
                        : `relative flex h-[34px] items-center gap-2.5 rounded-full px-3 text-[14px] font-medium text-text-secondary transition-colors duration-150 outline-none hover:bg-neutral-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${rowJustify}`
                    }
                  >
                    <NavIcon icon={item.icon} />
                    <span className={`flex-1 truncate ${label}`}>{item.label}</span>
                    {item.countKey ? (
                      // In the rail/collapsed the badge rides the icon's
                      // corner; expanded it sits in flow at the row's right.
                      <span
                        className={
                          collapsed
                            ? "absolute top-0 right-0.5"
                            : "absolute top-0 right-0.5 md:static"
                        }
                      >
                        <CountBadge kind={item.countKey} value={counts[item.countKey]} />
                      </span>
                    ) : null}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      {/* When collapsed, a lone expand button so the rail is recoverable. */}
      {collapsed ? (
        <div className="hidden justify-center p-2 md:flex">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex size-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-neutral-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronsRight className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      <div className="border-t border-border p-2">
        <a
          href="https://github.com/mushtaqahmaduop/inovice-system#readme"
          target="_blank"
          rel="noreferrer"
          title="Need help? View documentation"
          className={`flex h-[34px] items-center gap-2.5 rounded-full px-3 text-text-secondary transition-colors hover:bg-neutral-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${rowJustify}`}
        >
          <HelpCircle className="size-4 shrink-0" strokeWidth={1.75} />
          <span className={`min-w-0 flex-1 ${label}`}>
            <span className="block text-[13px] leading-4 font-medium text-foreground">
              Need help?
            </span>
            <span className="block truncate text-[12px] leading-4 text-text-tertiary">
              View documentation
            </span>
          </span>
        </a>
      </div>
    </aside>
  );
}
