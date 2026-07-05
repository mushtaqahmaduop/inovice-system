// Status chips (DESIGN_BRIEF §3 problem 3): hairline-bordered pills so
// status reads as state, not data. Color rules are contractual (CLAUDE.md
// §5): burnt orange ONLY for overdue/void, green ONLY for paid, everything
// else neutral ink. "sealed" is independent of payment status.

export type ChipVariant =
  | "neutral" // draft, unpaid, partial, walk-in, regular…
  | "ink" // · sealed ·
  | "success" // paid
  | "warning" // voided (outline)
  | "warning-filled"; // overdue — the loudest state on the page

const VARIANT_CLASS: Record<ChipVariant, string> = {
  neutral: "border-hairline-strong bg-surface-2 text-ink-3",
  ink: "border-ink-2 bg-surface text-ink-2",
  success: "border-success bg-success-soft text-success",
  warning: "border-warning bg-surface text-warning",
  "warning-filled": "border-warning bg-warning text-surface",
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
      className={`mono inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[9px] tracking-[0.1em] whitespace-nowrap uppercase ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </span>
  );
}
