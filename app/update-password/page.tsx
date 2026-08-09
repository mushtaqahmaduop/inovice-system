import { UpdatePasswordForm } from "./update-password-form";

// Reached either via the /auth/callback recovery redirect, or voluntarily
// by an already-signed-in user who wants to change their password.
//
// Forced dynamic for the same reason as /forgot-password/page.tsx — avoids
// a build-time SSR pass hitting createBrowserClient() with no env vars.
export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  // ?required=1 means the middleware sent them here: an admin set a temporary
  // password and no other screen is reachable until it is replaced. Saying so
  // outright beats letting someone wonder why the app keeps bouncing them.
  const required = (await searchParams).required === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-8 shadow-[var(--shadow-popover)]">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">Set a new password</h1>
        <p className="mt-1 mb-6 text-[13px] leading-[19px] text-text-secondary">
          {required
            ? "Your administrator set a temporary password. Choose your own to continue — the rest of the app opens up once you do."
            : "Choose a new password for your account."}
        </p>

        <UpdatePasswordForm required={required} />
      </div>
    </div>
  );
}
