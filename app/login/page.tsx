import { LoginForm } from "./login-form";

// No self-signup anywhere — accounts are created by the admin (D-19).
// Redesign slice 9: the auth screens follow the premium Federal-Blue look —
// a clean sealed card on the sunken ground, hexagon brand, no stamp.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-8 shadow-[var(--shadow-popover)]">
        <div className="mb-6 flex items-center gap-3">
          <svg viewBox="0 0 28 28" className="size-9 shrink-0" aria-hidden="true">
            <polygon points="14,1.5 25.5,8 25.5,20 14,26.5 2.5,20 2.5,8" className="fill-primary" />
            <path
              d="M9.5 11h9M9.5 14.5h9M9.5 18h5.5"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold tracking-tight text-foreground">
              Prestige Land
            </p>
            <p className="mono text-[11px] leading-4 text-text-tertiary">Invoice Ledger</p>
          </div>
        </div>

        <h1 className="text-[18px] leading-6 font-semibold text-foreground">Sign in</h1>
        <p className="mt-1 mb-6 text-[13px] leading-[19px] text-text-secondary">
          Authorized accounts only — there is no self-signup.
        </p>

        <LoginForm startAtMfa={params.mfa === "1"} inactive={params.reason === "inactive"} />

        <p className="mt-8 border-t border-border pt-4 text-center text-[12px] text-text-tertiary">
          Every action is recorded to the ledger.
        </p>
      </div>
    </div>
  );
}
