"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Route error boundary for every shell page (task 7.2). Renders INSIDE the
// sidebar/topbar chrome so a data failure never strands the user without
// navigation. Styled as an official-register notice — burnt orange is the
// palette's only alarm hue (CLAUDE.md §5); no raw stack traces on screen.
export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server log only until Sentry lands (7.2's blocked half).
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="border border-danger bg-surface p-6">
        <p className="mono mb-2 text-[10px] tracking-[0.16em] text-danger uppercase">
          Processing error
        </p>
        <h1 className="mb-2 text-[16px] font-semibold tracking-tight text-foreground">
          This page could not be prepared.
        </h1>
        <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
          Nothing was written — the ledger only changes through confirmed actions, so it is safe to
          try again. If this keeps happening, note the reference below and tell the administrator.
        </p>
        {error.digest ? (
          <p className="mono mb-4 text-[10px] tracking-[0.08em] text-text-tertiary">
            REF {error.digest}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button size="sm" variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
