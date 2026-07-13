"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Desktop keeps the Base-UI slide-over (§2.5); on phones the same content
// becomes a vaul bottom-sheet with a drag handle and drag-to-close. The
// breakpoint is 768px (Tailwind md) — matched to the Sheet's sm: width jump.
function useIsDesktop() {
  // Start desktop-side so SSR and the first client paint agree (the sheet is
  // closed on load, so there is nothing visible to mismatch); the effect
  // corrects to the real viewport before it can ever open.
  const [isDesktop, setIsDesktop] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  children,
  desktopClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  titleClassName?: string;
  children: React.ReactNode;
  desktopClassName?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn("w-full overflow-y-auto p-6 sm:w-[48%] sm:max-w-[48%]", desktopClassName)}
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-[16px] border-t border-border bg-surface shadow-[var(--shadow-drawer)] outline-none"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border-strong" />
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
