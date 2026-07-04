import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createAuthUser, AdminApiError } from "@/lib/auth/admin-api";
import { createClient } from "@/lib/supabase/server";

// No email infrastructure exists yet (Resend is blocked on Q-11–17), so the
// admin sets each account's initial password in person — fitting for a
// single-shop team. Role is admin|staff per D-19; who besides the owner is
// admin awaits Q-06, the form defaults to staff.
const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(10).max(200),
  role: z.enum(["admin", "staff"]),
});

// POST — create a staff/admin account (admin + aal2 only).
export async function POST(request: Request) {
  const { ctx, error } = await requireAdminApi();
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const { fullName, email, password, role } = parsed.data;

  let userId: string;
  try {
    ({ id: userId } = await createAuthUser(email, password));
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 422 || e.status === 409)) {
      return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
    }
    throw e;
  }

  // Profile via the ADMIN'S OWN client — RLS profiles_insert_admin authorizes.
  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: userId, full_name: fullName, role, is_active: true });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ id: userId, createdBy: ctx.userId }, { status: 201 });
}
