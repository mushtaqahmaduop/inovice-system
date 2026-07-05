"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Sidebar({ role }: { role: "admin" | "staff" }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-hairline bg-surface md:flex">
      <div className="border-b border-hairline px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="mono inline-flex h-7 w-7 shrink-0 items-center justify-center border border-ink text-[10px] font-medium text-ink">
            IL
          </span>
          <span className="text-[14px] font-medium tracking-tight text-ink">Invoice Ledger</span>
        </div>
        <p className="mono mt-2 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
          Business · Govt · Typing
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.filter((s) => !s.adminOnly || role === "admin").map((section) => (
          <div key={section.label} className="mb-4">
            <p className="mono px-2 pb-1.5 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
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
                      className="flex cursor-default items-center gap-2.5 px-2 py-1.5 text-[13px] text-ink-4"
                      aria-disabled="true"
                      title={`Arrives with task ${item.task}`}
                    >
                      <NavIcon icon={item.icon} />
                      <span className="flex-1">{item.label}</span>
                      <span className="mono text-[9px] tracking-[0.08em] text-ink-4">{item.task}</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex items-center gap-2.5 border-l-2 border-primary bg-accent px-2 py-1.5 text-[13px] font-medium text-ink"
                        : "flex items-center gap-2.5 border-l-2 border-transparent px-2 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-accent hover:text-ink"
                    }
                  >
                    <NavIcon icon={item.icon} />
                    <span className="flex-1">{item.label}</span>
                    {item.adminOnly ? (
                      <span className="mono text-[9px] tracking-[0.08em] text-primary">ADM</span>
                    ) : null}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline px-4 py-3">
        <p className="mono text-[9px] tracking-[0.14em] text-ink-3 uppercase">Phase 2 · Shell</p>
      </div>
    </aside>
  );
}
