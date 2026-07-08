import { requireUser } from "@/lib/auth/guards";
import { EnrollMfa } from "./enroll-mfa";

// R-9.2: the ONLY page an un-enrolled admin can reach (middleware enforces).
// Staff may enroll voluntarily; only the admin role is required to.
export default async function MfaSetupPage() {
  const ctx = await requireUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-sunken px-4 py-10">
      <div className="w-full max-w-sm rounded-[16px] border border-border bg-surface p-8 shadow-[var(--shadow-popover)]">
        <p className="text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">
          Security setup
        </p>
        <h1 className="mt-1 mb-6 text-[18px] leading-6 font-semibold text-foreground">
          {ctx.role === "admin"
            ? "Two-factor authentication is required for the admin role"
            : "Set up two-factor authentication"}
        </h1>
        <EnrollMfa />
      </div>
    </div>
  );
}
