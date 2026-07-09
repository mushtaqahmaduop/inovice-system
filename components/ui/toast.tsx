"use client";

import { useEffect, useState } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

// The app's single toast surface (LIBRARIES_GUIDE §2.3, DESIGN_SYSTEM §5.9).
// Styled to design tokens — a --surface-raised card with the popover shadow
// and a hairline border; success/error/warn tints come from the semantic
// tokens, never a library default palette (PREMIUM_EXECUTION_GUIDE §3).
//
// Theme: the app toggles a `.dark` class on <html> directly (no next-themes),
// so we mirror that class into sonner's `theme` prop and keep it in sync.
export function Toaster() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    // Dev-only: expose `toast` for manual QA / screenshot harnesses. The
    // whole branch is stripped from production builds (NODE_ENV is statically
    // "production"), so it never reaches the deployed app.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __toast?: typeof toast }).__toast = toast;
    }
    return () => obs.disconnect();
  }, []);

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      gap={8}
      offset={16}
      toastOptions={{
        // Map sonner's CSS variables onto our tokens so every variant reads
        // from the design system in both modes.
        style: {
          background: "var(--surface-raised)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-popover)",
          fontSize: "13px",
        },
        classNames: {
          title: "font-sans font-[550]",
          description: "text-text-secondary",
          actionButton: "!bg-primary !text-on-accent",
          cancelButton: "!bg-bg-sunken !text-text-secondary",
          icon: "[&>svg]:h-4 [&>svg]:w-4",
        },
      }}
      style={
        {
          // Semantic accents for the coloured variants (success/error/warning).
          "--success-text": "var(--success)",
          "--error-text": "var(--error)",
          "--warning-text": "var(--warn)",
        } as React.CSSProperties
      }
    />
  );
}

export { toast };
