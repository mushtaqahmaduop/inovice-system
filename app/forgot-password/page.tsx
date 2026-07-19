import { ForgotPasswordForm } from "./forgot-password-form";

// Self-service password recovery, entry point for accounts that lost their
// password (there's no admin "reset password" UI in-app yet — this is the
// gap flagged in CODEX_REVIEW.md; recovery previously required going into
// the Supabase dashboard directly).
//
// Forced dynamic like /login and /mfa-setup: a statically prerendered auth
// page would call createBrowserClient() during the build's SSR pass, before
// NEXT_PUBLIC_SUPABASE_* env vars are ever relevant, and crash the build.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-8 shadow-[var(--shadow-popover)]">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1 mb-6 text-[13px] leading-[19px] text-text-secondary">
          Enter your account email and we&apos;ll send a 6-digit code to reset your password.
        </p>

        <ForgotPasswordForm />

        <p className="mt-8 border-t border-border pt-4 text-center text-[12px] text-text-tertiary">
          <a href="/login" className="underline-offset-2 hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
