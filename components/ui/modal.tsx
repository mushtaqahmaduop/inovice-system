"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Shared dialog shell for the app's three hand-rolled modals (customer,
// service, void) per DESIGN_SYSTEM_CLAUDE_BLUE — a floating card on a dim
// scrim: radius-14, hairline border, surface-raised, drawer shadow, a titled
// header rule, and Esc/scrim-click to dismiss. Shadows live only on floating
// layers (§1), so this is one of the few places one appears.
export function Modal({
  title,
  description,
  onClose,
  children,
  size = "md",
  dismissable = true,
  tone = "default",
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md";
  dismissable?: boolean;
  tone?: "default" | "danger";
}) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable, onClose]);

  // Focus management: move focus into the dialog on open, keep Tab cycling
  // within it (a modal that leaks focus to the page behind is a keyboard /
  // screen-reader trap of the wrong kind), and restore focus to the element
  // that opened it on close.
  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    (focusables()[0] ?? panel).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    // Owner, 2026-07-31: the taller forms ("Add regular client", "Edit
    // walk-in") were cut off — their Save button sat below the fold on a
    // laptop. The panel is now capped to the viewport and scrolls INSIDE
    // itself, with the footer pinned to its bottom edge, so the actions are
    // always reachable however long the form gets. 100dvh, not 100vh: on
    // mobile browsers the URL bar makes vh taller than what is actually
    // visible, which is what would clip the footer again.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 dark:bg-black/60"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[14px] border border-border bg-surface-raised shadow-[var(--shadow-drawer)] outline-none",
          size === "sm" ? "max-w-sm" : "max-w-md"
        )}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2
            id={titleId}
            className={cn(
              "text-[15px] font-semibold",
              tone === "danger" ? "text-danger" : "text-foreground"
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// Standard right-aligned Cancel / confirm footer used by the modal forms.
// Sticky to the bottom of the modal's scrolling body: the negative margins
// cancel that body's p-5 so the bar spans the full panel width and its opaque
// background hides the fields scrolling underneath it.
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex justify-end gap-2 border-t border-border bg-surface-raised px-5 py-3">
      {children}
    </div>
  );
}
