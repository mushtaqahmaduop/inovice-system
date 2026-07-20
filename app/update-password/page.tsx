import { UpdatePasswordForm } from "./update-password-form";

// Reached either via the /auth/callback recovery redirect, or voluntarily
// by an already-signed-in user who wants to change their password.
//
// Forced dynamic for the same reason as /forgot-password/page.tsx — avoids
// a build-time SSR pass hitting createBrowserClient() with no env vars.
export const dynamic = "force-dynamic";

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-8 shadow-[var(--shadow-popover)]">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">
          Set a new password
        </h1>
        <p className="mt-1 mb-6 text-[13px] leading-[19px] text-text-secondary">
          Choose a new password for your account.
        </p>

        <UpdatePasswordForm />
      </div>
    </div>
  );
}
