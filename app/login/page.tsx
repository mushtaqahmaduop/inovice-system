import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/shell/brand-mark";
import { Skyline } from "@/components/shell/skyline";

// No self-signup anywhere — accounts are created by the admin (D-19).
// Redesigned to the owner's mockup (2026-07-30): the brand lockup stands ABOVE
// the card so the mark is the first thing on the page, the card carries the
// welcome copy and the form, and a decorative Dubai skyline anchors the foot.
// The skyline is inline SVG (no extra asset) and aria-hidden.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const year = new Date().getFullYear();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg-sunken px-4 py-10">
      {/* Decorative only — sits behind everything, never intercepts a click. */}
      <Skyline className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full text-border-strong/60 select-none md:h-60" />

      <div className="relative w-full max-w-sm">
        {/* Brand lockup */}
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark className="size-16 shrink-0" size={128} />
          <p className="mt-3 text-[20px] leading-6 font-semibold tracking-[0.06em] text-foreground uppercase">
            Prestige Land
          </p>
          <p className="mt-1 text-[13px] leading-4 font-medium tracking-[0.16em] text-primary uppercase">
            Typing Center
          </p>
          <p className="mt-3 max-w-[19rem] text-[12px] leading-[17px] text-text-secondary">
            Business Services · Government Transactions · Clearance &amp; Follow-up
          </p>
          {/* The one place gold appears outside the mark — a hairline rule. */}
          <span aria-hidden="true" className="mt-3 block h-px w-16 bg-[#d9a441]" />
        </div>

        <div className="rounded-[16px] border border-border bg-surface p-7 shadow-[var(--shadow-popover)]">
          <h1 className="text-[19px] leading-6 font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 mb-6 text-[13px] leading-[19px] text-text-secondary">
            Sign in to your account to continue. Authorized accounts only — there is no self-signup.
          </p>

          <LoginForm startAtMfa={params.mfa === "1"} reason={params.reason} />

          <p className="mt-6 flex items-center justify-center gap-1.5 border-t border-border pt-4 text-[12px] text-text-tertiary">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            Secure access — every action is recorded to the ledger.
          </p>
        </div>

        <p className="mt-6 text-center text-[12px] text-text-tertiary">
          © {year} Prestige Land Typing Center. All rights reserved.
        </p>
      </div>
    </div>
  );
}
