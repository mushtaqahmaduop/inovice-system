"use client";

import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "./nav-items";

// Topbar page title derived from the pathname via the nav registry —
// longest matching href wins so /admin/users beats /admin.
export function PageTitle() {
  const pathname = usePathname();
  const items = NAV_SECTIONS.flatMap((s) => s.items);
  const match = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <h1 className="truncate text-[15px] font-medium tracking-tight text-ink">
      {match?.label ?? "Invoice Ledger"}
    </h1>
  );
}
