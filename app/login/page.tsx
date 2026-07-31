import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/shell/brand-mark";
import { Skyline } from "@/components/shell/skyline";

// No self-signup anywhere — accounts are created by the admin (D-19).
// Redesigned to the owner's mockup (2026-07-30): brand lockup above the card so
// the mark leads the page, welcome copy + form in the card, a decorative Dubai
// skyline at the foot.
//
// HEIGHT IS LOAD-BEARING HERE. The first cut centred a ~700px stack inside
// `min-h-screen overflow-hidden`, which on a laptop viewport clipped the Sign in
// button AND made it unreachable — overflow-hidden meant it could not even be
// scrolled to. So: no overflow-hidden anywhere on the page (the container grows
// and scrolls if it must), the skyline is `fixed` so it is pinned to the viewport
// and contributes no layout height at all, and the stack is kept tight enough to
// fit a ~600px usable viewport without scrolling.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const year = new Date().getFullYear();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg-sunken px-4 py-6">
      {/* Decorative only: fixed, so it never adds page height; behind the card
          and never intercepts a click. */}
      <Skyline className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-36 w-full text-border-strong/60 select-none md:h-52" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand lockup */}
        <div className="mb-4 flex flex-col items-center text-center">
          <BrandMark className="size-14 shrink-0" size={112} />
          <p className="mt-2 text-[19px] leading-6 font-semibold tracking-[0.06em] text-foreground uppercase">
            Prestige Land
          </p>
          <p className="text-[12px] leading-4 font-medium tracking-[0.16em] text-primary uppercase">
            Typing Center
          </p>
          <p className="mt-2 max-w-[19rem] text-[11.5px] leading-4 text-text-secondary">
            Business Services · Government Transactions · Clearance &amp; Follow-up
          </p>
          {/* The one place gold appears outside the mark — a hairline rule. */}
          <span aria-hidden="true" className="mt-2.5 block h-px w-14 bg-[#d9a441]" />
        </div>

        <div className="rounded-[16px] border border-border bg-surface p-6 shadow-[var(--shadow-popover)]">
          <h1 className="text-[18px] leading-6 font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 mb-5 text-[13px] leading-[19px] text-text-secondary">
            Sign in to your account to continue.
          </p>

          <LoginForm startAtMfa={params.mfa === "1"} reason={params.reason} />
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-4 text-text-tertiary">
          Authorized accounts only — there is no self-signup. Every action is recorded to the
          ledger.
          <span className="mt-1 block">© {year} Prestige Land Typing Center.</span>
        </p>
      </div>
    </div>
  );
}
