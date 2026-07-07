"use client";

import { cn } from "@/lib/utils";

// Segmented control per DESIGN_SYSTEM_CLAUDE_BLUE §5.4 — the Claude
// "System | Reduced" pill group: sunken container, active segment gets a
// surface card + hairline. For status filters and theme/motion settings.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-bg-sunken p-0.5 dark:bg-neutral-soft",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-[30px] cursor-pointer rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border border-border bg-surface font-[550] text-foreground"
                : "border border-transparent text-text-secondary hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
