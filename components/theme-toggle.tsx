"use client";

import { useCallback, useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
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
      className="inline-flex h-7 items-center gap-1.5 rounded border border-hairline-strong bg-surface px-2.5 text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
      aria-label="Toggle theme"
    >
      <span className="mono text-[10px] tracking-[0.08em] uppercase">
        {dark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
