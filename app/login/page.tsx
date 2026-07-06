import { LoginForm } from "./login-form";

// No self-signup anywhere — accounts are created by the admin (D-19).
// Auth screens carry the strongest dose of the "Stamped Paper" identity:
// a faint oversized registry stamp behind a sealed-document card.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-4">
      {/* Watermark — decorative, near-invisible, like the ghost of a stamp */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] border-2 border-ink/[0.04] px-16 py-10 outline outline-offset-8 outline-ink/[0.04] select-none"
      >
        <p className="mono text-[28px] font-bold tracking-[0.3em] text-ink/[0.045] uppercase whitespace-nowrap">
          Official Registry
        </p>
      </div>

      <div className="relative w-full max-w-sm border border-hairline-strong bg-surface p-8">
        <div className="mb-2 flex items-center gap-3">
          <span className="mono inline-flex h-9 w-9 shrink-0 items-center justify-center border border-ink text-[11px] font-bold text-ink outline outline-offset-2 outline-ink/40">
            IL
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold tracking-tight text-ink">Invoice Ledger</p>
            <p className="mono text-[8.5px] tracking-[0.22em] text-ink-3 uppercase">
              Official Registry · Stamped Paper
            </p>
          </div>
        </div>
        <div className="mb-6 border-b border-hairline pt-4" />
        <LoginForm startAtMfa={params.mfa === "1"} inactive={params.reason === "inactive"} />
        <p className="mono mt-8 border-t border-hairline pt-4 text-center text-[9px] tracking-[0.18em] text-ink-4 uppercase">
          Authorized accounts only
        </p>
      </div>
    </div>
  );
}
