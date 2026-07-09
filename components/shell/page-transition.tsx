"use client";

import { usePathname } from "next/navigation";

// §8 page transition: one orchestrated fade + rise per route change. Keying
// the wrapper on the pathname remounts it on navigation, which replays the
// `.page-enter` CSS animation (defined in globals.css). Pure CSS — the
// animation ends at transform:none, so it never reparents the fixed-overlay
// dialogs, and reduced-motion is handled by the global media query.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
