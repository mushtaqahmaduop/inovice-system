import { LoginForm } from "./login-form";

// No self-signup anywhere — accounts are created by the admin (D-19).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm border border-hairline bg-surface p-8">
        <div className="mb-8 flex items-baseline gap-2.5">
          <span className="mono inline-flex h-6 w-6 items-center justify-center border border-ink text-[10px] font-medium text-ink">
            IL
          </span>
          <span className="text-[15px] font-medium tracking-tight text-ink">Invoice Ledger</span>
        </div>
        <LoginForm startAtMfa={params.mfa === "1"} inactive={params.reason === "inactive"} />
      </div>
    </div>
  );
}
