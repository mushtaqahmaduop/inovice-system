// Status badges per DESIGN_SYSTEM_CLAUDE_BLUE §2.3 / §5.7 — soft background
// + strong text + 1px border of the soft family. NEVER solid-filled. Color
// contract survives the redesign: burnt orange (--danger) is overdue-only,
// green is paid-only; sealed is independent of payment (CLAUDE.md §5).
// Variant names kept from the Stamped Paper chips so call sites don't churn:
//   neutral        draft, unpaid, partial, walk-in, regular…
//   ink            · sealed · (issued) — accent-soft family
//   success        paid
//   warning        voided / partially paid — amber family
//   warning-filled overdue — danger family (soft per §2.3, no longer filled)

export type ChipVariant = "neutral" | "ink" | "success" | "warning" | "warning-filled";

const VARIANT_CLASS: Record<ChipVariant, string> = {
  neutral: "border-border-strong bg-neutral-soft text-text-secondary",
  ink: "border-accent-border bg-[var(--accent-soft)] text-primary",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warn/40 bg-warn-soft text-warn",
  "warning-filled": "border-danger/40 bg-danger-soft text-danger",
};

export function StatusChip({
  variant,
  title,
  children,
}: {
  variant: ChipVariant;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </span>
  );
}
