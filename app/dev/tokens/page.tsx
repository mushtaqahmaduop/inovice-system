// Token verification page (PREMIUM_EXECUTION_GUIDE §1.2 step 1) — the bare
// contract for DESIGN_SYSTEM_CLAUDE_BLUE §2–§4 before any component work.
// Dev-only surface: no data, no auth requirement beyond the middleware
// default; removed or ignored in the final QA pass if desired.

const COLOR_TOKENS = [
  "bg",
  "bg-sunken",
  "surface",
  "surface-raised",
  "text",
  "text-secondary",
  "text-tertiary",
  "border",
  "border-strong",
  "accent",
  "accent-hover",
  "accent-pressed",
  "accent-soft",
  "accent-border",
  "success",
  "success-soft",
  "warn",
  "warn-soft",
  "danger",
  "danger-soft",
  "neutral-soft",
  "error",
];

const TYPE_SCALE: { name: string; cls: string; sample: string }[] = [
  {
    name: "display-xl 34/40 serif 600",
    cls: "serif text-[34px] leading-10 font-semibold",
    sample: "AED 42,180.00",
  },
  {
    name: "display 26/32 serif 600",
    cls: "serif text-[26px] leading-8 font-semibold",
    sample: "Customer Ledger",
  },
  {
    name: "title 18/26 sans 600",
    cls: "text-[18px] leading-[26px] font-semibold",
    sample: "Record payment",
  },
  {
    name: "body 15/23 sans 400",
    cls: "text-[15px] leading-[23px]",
    sample: "Payment status derives from recorded payments.",
  },
  {
    name: "body-strong 15/23 sans 550",
    cls: "text-[15px] leading-[23px] font-[550]",
    sample: "Prestige Land Typing Center",
  },
  {
    name: "small 13/19 sans 400",
    cls: "text-[13px] leading-[19px]",
    sample: "Sealed invoices are immutable.",
  },
  {
    name: "caption 12/16 sans 500 upper",
    cls: "text-[12px] leading-4 font-medium tracking-[0.04em] uppercase",
    sample: "This month",
  },
  {
    name: "money 15/23 mono 500",
    cls: "mono text-[15px] leading-[23px] font-medium",
    sample: "AED 1,250.00",
  },
  {
    name: "money-lg 22/28 mono 600",
    cls: "mono text-[22px] leading-7 font-semibold",
    sample: "AED 10,500.00",
  },
];

export default function TokensPage() {
  return (
    <div className="mx-auto max-w-[1040px] bg-background px-8 py-10 text-foreground">
      <p className="text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Redesign slice 1 · token contract
      </p>
      <h1 className="serif mt-1 text-[26px] leading-8 font-semibold">Warm Paper / Federal Blue</h1>
      <p className="mt-1 max-w-[64ch] text-[15px] leading-[23px] text-text-secondary">
        Every color, type, radius and shadow token from DESIGN_SYSTEM_CLAUDE_BLUE §2–§4, rendered
        raw. If this page is right in both themes, the primitives can begin.
      </p>

      <h2 className="mt-10 mb-3 text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Color
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLOR_TOKENS.map((t) => (
          <div key={t} className="rounded-[8px] border border-border bg-surface p-2">
            <div
              className="h-10 rounded-[6px] border border-border"
              style={{ background: `var(--${t})` }}
            />
            <p className="mono mt-1.5 text-[11px] text-text-secondary">--{t}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Type scale (§3.2)
      </h2>
      <div className="divide-y divide-border rounded-[12px] border border-border bg-surface">
        {TYPE_SCALE.map((t) => (
          <div key={t.name} className="flex items-baseline justify-between gap-6 px-5 py-3">
            <span className={t.cls}>{t.sample}</span>
            <span className="mono shrink-0 text-[11px] text-text-tertiary">{t.name}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Radius · elevation · accent states
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        {(["8px", "12px", "16px", "999px"] as const).map((r) => (
          <div
            key={r}
            className="flex h-16 w-24 items-center justify-center border border-border-strong bg-surface"
            style={{ borderRadius: r }}
          >
            <span className="mono text-[11px] text-text-secondary">{r}</span>
          </div>
        ))}
        <div
          className="flex h-16 w-32 items-center justify-center rounded-[12px] bg-surface-raised"
          style={{ boxShadow: "var(--shadow-popover)" }}
        >
          <span className="mono text-[11px] text-text-secondary">popover</span>
        </div>
        <div
          className="flex h-16 w-32 items-center justify-center rounded-[16px] bg-surface-raised"
          style={{ boxShadow: "var(--shadow-drawer)" }}
        >
          <span className="mono text-[11px] text-text-secondary">drawer</span>
        </div>
        <div className="flex items-center gap-2">
          {(["accent", "accent-hover", "accent-pressed"] as const).map((s) => (
            <div
              key={s}
              className="flex h-[38px] items-center rounded-full px-[18px] text-[15px] font-[550] text-on-accent"
              style={{ background: `var(--${s})` }}
            >
              {s.replace("accent-", "").replace("accent", "default")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
