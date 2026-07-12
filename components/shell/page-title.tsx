"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { NAV_SECTIONS } from "./nav-items";

// Sub-pages that aren't top-level nav items (the invoice editor) show a
// topbar title + breadcrumb and omit the big in-body <h1>, per the owner's
// New-Invoice mockup. Top-level nav pages keep the single-line topbar title
// (their <h1> lives in the page body). Extend this map as new sub-pages land.
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

  const items = NAV_SECTIONS.flatMap((s) => s.items);
  const match = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <h1 className="truncate text-[15px] font-medium tracking-tight text-foreground">
      {match?.label ?? "Prestige Land"}
    </h1>
  );
}
