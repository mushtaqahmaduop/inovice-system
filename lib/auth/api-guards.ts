import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/guards";

// API-route guards: JSON status codes, no redirects.
// Each returns either the verified context or the response to send back.

// Any signed-in active user (staff or admin) — 401 JSON otherwise. RLS is
// the real enforcement behind it; this just fails fast with a clean status.
export async function requireUserApi(): Promise<
  { ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  return { ctx };
}

// API-route variant of requireAdminAal2.
export async function requireAdminApi(): Promise<
  { ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  if (ctx.role !== "admin" || ctx.aal !== "aal2") {
    // Staff, or an admin session that never passed the TOTP challenge.
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { ctx };
}
