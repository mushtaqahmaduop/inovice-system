"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

// Topbar identity chip → dropdown (redesign slice 8). The avatar + name open
// a small menu; Sign out submits the server action passed from the shell
// layout. No notifications feature, so no bell.
export function UserMenu({
  name,
  role,
  signOut,
}: {
  name: string;
  role: string;
  signOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "—";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-transparent py-1 pr-1 pl-2 transition-colors outline-none hover:bg-bg-sunken focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="hidden text-right leading-tight sm:block">
          <span className="block text-[13px] font-medium text-foreground">{name}</span>
          <span className="mono block text-[10px] tracking-[0.08em] text-text-tertiary uppercase">
            {role}
          </span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
          {initials}
        </span>
        <ChevronDown className="size-4 text-text-tertiary" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-[var(--shadow-popover)]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
            <p className="mono text-[11px] tracking-[0.06em] text-text-tertiary uppercase">
              {role}
            </p>
          </div>
          <form action={signOut} className="p-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-bg-sunken focus-visible:bg-bg-sunken focus-visible:outline-none"
            >
              <LogOut className="size-4 text-text-tertiary" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
