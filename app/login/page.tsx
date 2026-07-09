import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/shell/brand-mark";

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
          <BrandMark className="size-10 shrink-0" />
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
