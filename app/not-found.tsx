import Link from "next/link";

// Styled 404 (task 7.2) — reached from bad URLs and from notFound() on
// unknown invoice/customer ids. Register vocabulary, neutral ink: a
// missing page is not an alarm state.
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm border border-border bg-surface p-6 text-center">
        <p className="mono mb-2 text-[10px] tracking-[0.16em] text-text-tertiary uppercase">
          Not on the register
        </p>
        <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
          No document or page exists at this address. It may have been mistyped, or the record you
          followed no longer exists.
        </p>
        <Link
          href="/dashboard"
          className="mono inline-block border border-border-strong bg-surface px-4 py-1.5 text-[11px] tracking-[0.08em] text-foreground uppercase hover:bg-bg-sunken"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
