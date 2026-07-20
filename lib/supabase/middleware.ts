import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Server-side route guard (task 2.1). Every rule here is enforced on the
// request path — the UI merely mirrors it. Rules:
// - No verified user            → only /login, /forgot-password and the
//   /auth/callback recovery-link handler are reachable.
// - Deactivated / no profile    → signed out, back to /login (is_active is
//   ALSO enforced by RLS app_role(); this check just fails fast).
// - role=admin, no TOTP factor  → hard-locked to /mfa-setup (R-9.2): a fresh
//   admin cannot reach ANY app route before enrolling.
// - role=admin, factor, aal1    → locked to /login?mfa=1 (challenge step),
//   except /update-password: a password-recovery session for an MFA'd
//   admin is aal1 by construction, so it gets its own escape hatch to reach
//   the reset form — the form itself demands the TOTP step before it will
//   actually write the new password (see update-password-form.tsx).
// - role=staff                  → /admin/* is never reachable.
// Admin-only surface = everything under /admin.

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT against the auth server — never trust
  // getSession() alone on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // API routes answer with 401/403 JSON from their own identity checks —
  // redirecting them to /login would hand fetch() callers an HTML page.
  // updateSession above has already refreshed the cookies.
  if (path.startsWith("/api/")) return supabaseResponse;

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = to.split("?");
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    const res = NextResponse.redirect(url);
    // Preserve refreshed auth cookies on the redirect.
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    return isPublic ? supabaseResponse : redirect("/login");
  }

  // Active profile? (RLS app_role() returns rows only for active users, so a
  // deactivated user reads their own profile as "not found".)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return redirect("/login?reason=inactive");
  }

  const isAdmin = profile.role === "admin";
  const hasVerifiedTotp = (user.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );

  if (isAdmin) {
    if (!hasVerifiedTotp) {
      // R-9.2 hard gate: setup-only page until TOTP is enrolled.
      return path === "/mfa-setup" ? supabaseResponse : redirect("/mfa-setup");
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      // Enrolled but this session never passed the TOTP challenge — unless
      // they're here to reset a forgotten password, which necessarily
      // starts at aal1 even for an MFA'd admin.
      if (path === "/update-password") return supabaseResponse;
      return isPublic ? supabaseResponse : redirect("/login?mfa=1");
    }
  } else if (path === "/admin" || path.startsWith("/admin/")) {
    // Staff never reach admin routes — server-side, not just hidden nav.
    return redirect("/dashboard");
  }

  if (isPublic) {
    // Fully authenticated users don't linger on /login.
    const mfaPending = request.nextUrl.searchParams.get("mfa") === "1";
    if (!mfaPending) return redirect("/dashboard");
  }

  return supabaseResponse;
}
