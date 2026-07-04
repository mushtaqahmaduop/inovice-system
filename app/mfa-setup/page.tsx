import { requireUser } from "@/lib/auth/guards";
import { EnrollMfa } from "./enroll-mfa";

// R-9.2: the ONLY page an un-enrolled admin can reach (middleware enforces).
// Staff may enroll voluntarily; only the admin role is required to.
export default async function MfaSetupPage() {
  const ctx = await requireUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm border border-hairline bg-surface p-8">
        <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
          Security setup
        </p>
        <h1 className="mb-6 text-[15px] font-medium tracking-tight text-ink">
          {ctx.role === "admin"
            ? "Two-factor authentication is required for the admin role"
            : "Set up two-factor authentication"}
        </h1>
        <EnrollMfa />
      </div>
    </div>
  );
}
