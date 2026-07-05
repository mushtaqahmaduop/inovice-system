import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { revokeAllSessions } from "@/lib/auth/admin-api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  action: z.enum(["revoke_sessions", "deactivate", "reactivate"]),
});
const idSchema = z.string().uuid();

// POST — session revocation + activation toggles (admin + aal2 only, D-18).
// - revoke_sessions: kills every session; lockout on the target's next
//   request (middleware getUser() re-validates server-side each time).
// - deactivate: is_active=false (the RLS app_role() circuit-breaker) AND
//   revokes sessions — belt and braces, per the 2.2 acceptance criteria.
// - reactivate: is_active=true; the user signs in again normally.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAdminApi();
  if (error) return error;

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const targetId = parsedId.data;
  const { action } = parsed.data;

  if (targetId === ctx.userId && action !== "revoke_sessions") {
    // Deactivating yourself would orphan the shop with no active admin.
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Unknown user." }, { status: 404 });

  if (action === "deactivate" || action === "reactivate") {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_active: action === "reactivate" })
      .eq("id", targetId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (action === "revoke_sessions" || action === "deactivate") {
    await revokeAllSessions(targetId);
  }

  return NextResponse.json({ ok: true });
}
