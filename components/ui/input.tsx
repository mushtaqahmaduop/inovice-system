import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 border border-input bg-surface px-3 text-sm text-ink transition-colors outline-none",
        "placeholder:text-ink-3 focus-visible:border-ring focus-visible:shadow-[var(--shadow-focus)]",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
