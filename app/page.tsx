import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-hairline bg-paper px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="mono inline-flex h-6 w-6 items-center justify-center border border-ink text-[10px] font-medium text-ink">
            IL
          </span>
          <span className="text-[15px] font-medium tracking-tight text-ink">Invoice Ledger</span>
          <span className="mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Phase 0 · Foundation
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center">
        <div className="max-w-md border border-hairline bg-surface p-8 text-center">
          <p className="mono mb-2 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            Stamped Paper — themed shell
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            Foundation only. Tokens ported from the approved prototype; Inter Tight for UI,{" "}
            <span className="num">JetBrains Mono 1,234.56</span> for numerics.
          </p>
        </div>
      </main>
    </div>
  );
}
