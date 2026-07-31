"use client";

import { useCallback } from "react";
import { Moon, Sun } from "lucide-react";

// Light/dark switch (owner, 2026-07-31: signs, not the words "Dark"/"Light").
// Both icons are rendered and the `dark:` variant picks one in CSS, so the
// correct sign is right on the very first paint — a JS-driven choice would
// flash the wrong icon before hydration. The sign shows the mode you are
// switching TO: a sun while dark, a moon while light.
export function ThemeToggle() {
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage unavailable — theme just won't persist
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-transparent text-text-secondary transition-colors duration-150 outline-none hover:bg-bg-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Toggle light or dark mode"
      title="Toggle light or dark mode"
    >
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
    </button>
  );
}
