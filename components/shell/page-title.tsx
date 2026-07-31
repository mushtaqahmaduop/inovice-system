"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { NAV_SECTIONS } from "./nav-items";

// The page's name lives HERE, in the topbar, for every page (owner's marked
// screenshot, 2026-07-27). The in-body <h1>s were removed at the same time,
// so the name is printed once, not twice, and the body starts straight at the
// content. Sub-pages that aren't top-level nav items (the invoice editor)
// additionally show a breadcrumb — extend crumbFor as new ones land.
type Crumb = { title: string; parent: { label: string; href: string } };

// Pages that are real destinations but deliberately not sidebar nav items —
// /help lives in the sidebar footer, so the registry lookup below misses it
// and the title would fall back to the company name.
const EXTRA_TITLES: Record<string, string> = { "/help": "Need help?" };

function crumbFor(pathname: string): Crumb | null {
  if (pathname === "/invoices/new") {
    return { title: "New Invoice", parent: { label: "Invoices", href: "/invoices" } };
  }
  if (/^\/invoices\/[^/]+\/edit$/.test(pathname)) {
    return { title: "Edit Invoice", parent: { label: "Invoices", href: "/invoices" } };
  }
  return null;
}

// Topbar page title derived from the pathname. Sub-pages render an icon +
// title + breadcrumb; everything else derives its title from the nav
// registry (longest matching href wins so /admin/users beats /admin).
export function PageTitle() {
  const pathname = usePathname();
  const crumb = crumbFor(pathname);

  if (crumb) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-primary">
          <FileText className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] leading-5 font-semibold tracking-tight text-foreground">
            {crumb.title}
          </h1>
          <nav
            aria-label="Breadcrumb"
            className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-text-tertiary"
          >
            <Link
              href={crumb.parent.href}
              className="underline-offset-2 hover:text-text-secondary hover:underline"
            >
              {crumb.parent.label}
            </Link>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            <span className="truncate text-text-secondary">{crumb.title}</span>
          </nav>
        </div>
      </div>
    );
  }

  // Longest matching href wins, so /admin/users beats /admin.
  const items = NAV_SECTIONS.flatMap((s) => s.items);
  const match = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <h1 className="truncate text-[17px] leading-6 font-semibold tracking-tight text-foreground">
      {match?.label ?? EXTRA_TITLES[pathname] ?? "Prestige Land"}
    </h1>
  );
}
