import Link from "next/link";

// Shell-scoped not-found (task 7.2): unknown invoice/customer ids land
// here via notFound() and keep the sidebar/topbar, unlike the standalone
// root 404. Neutral ink — a missing record is not an alarm state.
export default function ShellNotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="border border-border bg-surface p-6">
        <p className="mono mb-2 text-[10px] tracking-[0.16em] text-text-tertiary uppercase">
          Not on the register
        </p>
        <h1 className="mb-2 text-[16px] font-semibold tracking-tight text-foreground">
          No such record.
        </h1>
        <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">
          Nothing exists at this address — the id may be mistyped, or the link is stale. Sealed
          documents are never deleted, so a once-valid invoice link always keeps working.
        </p>
        <Link
          href="/invoices"
          className="mono inline-block border border-border-strong bg-surface px-4 py-1.5 text-[11px] tracking-[0.08em] text-foreground uppercase hover:bg-bg-sunken"
        >
          Open the invoice list
        </Link>
      </div>
    </div>
  );
}
