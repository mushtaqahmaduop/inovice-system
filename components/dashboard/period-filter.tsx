"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { PERIODS, type PeriodKey } from "@/lib/dashboard-period";

// The dashboard's period chip. Was decorative until the owner asked for it to
// work (2026-07-27). The choice lives in the URL (?period=…) rather than in
// component state, so the server component can compute the figures for it —
// and so a particular view can be bookmarked or sent to someone.
export function PeriodFilter({ value }: { value: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (key: PeriodKey) => {
    setOpen(false);
    const next = new URLSearchParams(searchParams.toString());
    // "This month" is the default view — keep that URL clean.
    if (key === "this-month") next.delete("period");
    else next.set("period", key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const current = PERIODS.find((p) => p.key === value) ?? PERIODS[0];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-border-strong"
      >
        <Calendar className="size-4 text-text-tertiary" />
        {current.label}
        <ChevronDown className="size-4 text-text-tertiary" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 z-30 w-44 overflow-hidden rounded-[10px] border border-border bg-surface-raised py-1 shadow-[var(--shadow-popover)]"
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="menuitemradio"
              aria-checked={p.key === value}
              onClick={() => choose(p.key)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
            >
              <Check
                className={`size-4 ${p.key === value ? "text-primary" : "text-transparent"}`}
              />
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
