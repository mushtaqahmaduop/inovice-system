// Form field primitives per DESIGN_SYSTEM_CLAUDE_BLUE §5.2 — the Claude
// "label + gray description" row pattern. Errors are the muted red --error
// (13px, no red backgrounds); burnt orange belongs to OVERDUE alone (§2.3).

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] leading-[19px] font-medium text-foreground"
    >
      {children}
    </label>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">{children}</p>;
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[13px] leading-[19px] text-error">{children}</p>;
}
