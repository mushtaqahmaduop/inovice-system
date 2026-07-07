import * as React from "react";
import { cn } from "@/lib/utils";

// Inputs per DESIGN_SYSTEM_CLAUDE_BLUE §5.2 — 38px, radius-sm, surface bg
// (sunken in dark), border-strong; focus = accent border + 3px soft ring.
// Errors: aria-invalid turns the border --error (no red backgrounds).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[38px] w-full min-w-0 rounded-[8px] border border-border-strong bg-surface px-3 text-[15px] text-foreground transition-colors outline-none dark:bg-bg-sunken",
        "placeholder:text-text-tertiary",
        "focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)]",
        "aria-invalid:border-error",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

// Native <select> dressed as an Input — for the six form selects that don't
// need a popover component. Same 5 states as Input.
function SelectNative({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-[38px] w-full min-w-0 rounded-[8px] border border-border-strong bg-surface px-2.5 text-[15px] text-foreground transition-colors outline-none dark:bg-bg-sunken",
        "focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)]",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input, SelectNative };
