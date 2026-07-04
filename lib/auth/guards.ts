import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  email: string | null;
  role: "admin" | "staff";
  fullName: string;
  aal: "aal1" | "aal2";
  hasVerifiedTotp: boolean;
};

// Server-side identity + role, straight from the verified session and the
// RLS-guarded profiles row (CLAUDE.md §4 — never from client parameters).
// Returns null for anonymous, unknown or DEACTIVATED users (a deactivated
// user's own profile row is invisible to them via app_role()).
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role as "admin" | "staff",
    fullName: profile.full_name,
    aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasVerifiedTotp: (user.factors ?? []).some(
      (f) => f.factor_type === "totp" && f.status === "verified"
    ),
  };
}

// Layout/page guard for the admin surface — defense in depth behind the
// middleware: admin role AND an MFA-verified (aal2) session.
export async function requireAdminAal2(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "admin") redirect("/dashboard");
  if (!ctx.hasVerifiedTotp) redirect("/mfa-setup");
  if (ctx.aal !== "aal2") redirect("/login?mfa=1");
  return ctx;
}

export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}
