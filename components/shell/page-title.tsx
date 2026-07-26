"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { NAV_SECTIONS } from "./nav-items";

// Sub-pages that aren't top-level nav items (the invoice editor) show a
// topbar title + breadcrumb and omit the big in-body <h1>, per the owner's
// New-Invoice mockup. Extend this map as new sub-pages land.
//
// Top-level nav pages render NOTHING here: they already carry an <h1>, and
// printing the same word twice — once in the topbar, once as the page
// heading — was both a duplicate and a waste of the fold (owner, 2026-07-27).
// The sidebar's active pill says which page you are on.
type Crumb = { title: string; parent: { label: string; href: string } };

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

  // A page inside the nav registry owns its own heading — say nothing.
  const items = NAV_SECTIONS.flatMap((s) => s.items);
  const known = items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  if (known) return null;

  return (
    <h1 className="truncate text-[15px] font-medium tracking-tight text-foreground">
      Prestige Land
    </h1>
  );
}
