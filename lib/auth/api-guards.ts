import { NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/guards";

// API-route variant of requireAdminAal2: JSON status codes, no redirects.
// Returns either the verified context or the response to send back.
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
