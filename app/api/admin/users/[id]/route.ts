import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { revokeAllSessions, setAuthUserPassword } from "@/lib/auth/admin-api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revoke_sessions") }),
  z.object({ action: z.literal("deactivate") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("set_role"), role: z.enum(["admin", "staff"]) }),
  z.object({ action: z.literal("reset_password"), password: z.string().min(10).max(200) }),
  z.object({ action: z.literal("require_password_change"), required: z.boolean() }),
  z.object({
    action: z.literal("update_profile"),
    fullName: z.string().trim().min(2).max(120),
    // "" clears the number; a stored empty string would print as a blank
    // phone row rather than an honest em dash.
    phone: z.string().trim().max(40).nullable().optional(),
  }),
]);
const idSchema = z.string().uuid();

// Actions that would leave the shop without a way back in if aimed at
// yourself. revoke_sessions is absent on purpose: signing your own devices
// out is recoverable by signing back in.
const SELF_FORBIDDEN = new Set(["deactivate", "archive", "set_role", "require_password_change"]);

// POST — the admin console's whole action surface (admin + aal2 only, D-18).
// - revoke_sessions: kills every session; lockout on the target's next
//   request (middleware getUser() re-validates server-side each time).
// - deactivate: is_active=false (the RLS app_role() circuit-breaker) AND
//   revokes sessions — belt and braces, per the 2.2 acceptance criteria.
// - reactivate: is_active=true; the user signs in again normally.
// - archive/restore: the mockup's "delete user", done without erasing a row
//   that invoice_events.actor_id still points at (see migration 0018).
// - set_role, reset_password, require_password_change, update_profile: the
//   rest of what the console offers.
//
// Every branch re-reads the target under RLS first, so a request naming an
// id the caller cannot see 404s rather than acting.
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
  const body = parsed.data;
  const { action } = body;

  if (targetId === ctx.userId && SELF_FORBIDDEN.has(action)) {
    // Deactivating, archiving or demoting yourself would orphan the shop
    // with no reachable admin; forcing your own password change just locks
    // you into the reset form.
    return NextResponse.json(
      { error: "You cannot do that to your own account." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, archived_at")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Unknown user." }, { status: 404 });

  // Losing the last reachable admin bricks Settings, user management and
  // void/credit for everyone. Both routes to that outcome are blocked.
  const removesAnAdmin =
    target.role === "admin" &&
    (action === "deactivate" ||
      action === "archive" ||
      (action === "set_role" && body.role === "staff"));
  if (removesAnAdmin) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .is("archived_at", null)
      .neq("id", targetId);
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: "This is the last active admin — promote someone else first." },
        { status: 400 }
      );
    }
  }

  // Profile-table writes go through the ADMIN'S OWN client, under
  // profiles_update_admin — never the service key (CLAUDE.md §4).
  const patch: Record<string, unknown> = {};
  if (action === "deactivate") patch.is_active = false;
  if (action === "reactivate") patch.is_active = true;
  if (action === "archive") {
    patch.is_active = false;
    patch.archived_at = new Date().toISOString();
  }
  if (action === "restore") {
    patch.is_active = true;
    patch.archived_at = null;
  }
  if (action === "set_role") patch.role = body.role;
  if (action === "require_password_change") patch.must_change_password = body.required;
  if (action === "update_profile") {
    patch.full_name = body.fullName;
    patch.phone = body.phone?.trim() ? body.phone.trim() : null;
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", targetId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (action === "reset_password") {
    await setAuthUserPassword(targetId, body.password);
    // A password the admin typed is a temporary one by definition. Force the
    // change and clear the old devices so the interim password cannot be
    // left in service on a session that never saw it.
    await supabase
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", targetId);
  }

  // Anything that revokes authority takes the existing sessions with it —
  // otherwise a demoted or archived user keeps their old access until their
  // token happens to expire.
  const killsSessions =
    action === "revoke_sessions" ||
    action === "deactivate" ||
    action === "archive" ||
    action === "set_role" ||
    action === "reset_password";
  if (killsSessions) {
    await revokeAllSessions(targetId);
  }

  return NextResponse.json({ ok: true });
}

// GET — the detail drawer's Sessions and Activity tabs. Both read data the
// user-scoped client cannot reach (the auth schema) or would over-fetch for
// every row, so they load on demand for one user at a time.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminApi();
  if (error) return error;

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const targetId = parsedId.data;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Unknown user." }, { status: 404 });

  const sessions = await db.execute<{
    id: string;
    created_at: string;
    updated_at: string | null;
    aal: string | null;
    user_agent: string | null;
    ip: string | null;
  }>(sql`
    select id, created_at, updated_at, aal, user_agent, host(ip) as ip
    from auth.sessions
    where user_id = ${targetId}
    order by coalesce(updated_at, created_at) desc
    limit 20
  `);

  const activity = await db.execute<{
    id: string;
    event_type: string;
    created_at: string;
    invoice_number: string | null;
  }>(sql`
    select e.id, e.event_type, e.created_at, i.invoice_number
    from invoice_events e
    left join invoices i on i.id = e.invoice_id
    where e.actor_id = ${targetId}
    order by e.created_at desc
    limit 25
  `);

  return NextResponse.json({
    sessions: Array.from(sessions),
    activity: Array.from(activity),
  });
}
