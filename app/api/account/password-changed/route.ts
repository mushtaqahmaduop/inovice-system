import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUserApi } from "@/lib/auth/api-guards";

// Clears the caller's own must_change_password flag after they have actually
// set a new password at /update-password.
//
// It cannot go through the user's Supabase client: profiles_update_admin
// makes profiles writable by admins only, and a staff member completing a
// forced reset is by definition not an admin. So the write happens on the
// system connection — but the id comes from the VERIFIED session and nothing
// else (CLAUDE.md §4). There is no request body: this endpoint has exactly
// one possible effect, on exactly one row, and no caller can name a different
// user.
//
// Worst case if someone calls it without changing their password: the flag
// clears and the admin has to set it again. It gates a nag screen, not access
// — every real permission still comes from the role and RLS.
export async function POST() {
  const { ctx, error } = await requireUserApi();
  if (error) return error;

  await db.execute(
    sql`update public.profiles set must_change_password = false where id = ${ctx.userId}`
  );

  return NextResponse.json({ ok: true });
}
