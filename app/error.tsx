"use client";

import { useEffect } from "react";

// Root error boundary — catches failures outside the shell (login,
// MFA setup, the public landing redirect). Standalone and centered; the
// shell has its own richer boundary at app/(shell)/error.tsx.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm border border-danger bg-surface p-6 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.16em] text-danger uppercase">
          Processing error
        </p>
        <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
          The page could not be prepared. Nothing was written — it is safe to try again.
        </p>
        {error.digest ? (
          <p className="mono mb-4 text-[10px] tracking-[0.08em] text-text-tertiary">
            REF {error.digest}
          </p>
        ) : null}
        <button
          onClick={() => reset()}
          className="mono border border-border-strong bg-surface px-4 py-1.5 text-[11px] tracking-[0.08em] text-foreground uppercase hover:bg-bg-sunken"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
