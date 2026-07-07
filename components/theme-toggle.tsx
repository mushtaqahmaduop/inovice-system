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
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-transparent px-3 text-[13px] text-text-secondary transition-colors duration-150 outline-none hover:bg-bg-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Toggle theme"
    >
      <span>{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
