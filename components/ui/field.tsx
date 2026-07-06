// Form field primitives (DESIGN_BRIEF §3 problem 4). Labels follow the
// design system's "official form header" treatment — JetBrains Mono,
// uppercase, letterspaced — so every form reads like registry stationery.
// Errors are burnt orange (the palette's only warning hue), never red.

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mono mb-1.5 block text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase"
    >
      {children}
    </label>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{children}</p>;
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-warning">{children}</p>;
}
