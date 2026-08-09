// GoTrue admin REST calls used by user management (task 2.2).
//
// SERVICE-ROLE EXCEPTION (S-5.4): creating auth users and revoking sessions
// are administrative operations GoTrue only exposes to the service key. Every
// caller of these helpers MUST have passed requireAdminApi() first — identity
// and authority always come from the verified session, never from the key.
// All profile-table writes still go through the user-scoped client under RLS.

async function gotrueAdmin(method: string, path: string, body?: unknown) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `auth admin ${method} ${path} failed (${res.status})`;
    try {
      message = JSON.parse(text).msg ?? JSON.parse(text).message ?? message;
    } catch {}
    throw new AdminApiError(message, res.status);
  }
  return text ? JSON.parse(text) : null;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function createAuthUser(email: string, password: string): Promise<{ id: string }> {
  return gotrueAdmin("POST", "/users", { email, password, email_confirm: true });
}

// Admin-set password. There is still no email infrastructure (Resend is
// blocked on Q-11–17), so a forgotten password is handled the way this shop
// already handles a new account: the owner sets one and hands it over in
// person. Pair it with require_password_change so the temporary one cannot
// stay in use.
export function setAuthUserPassword(userId: string, password: string): Promise<unknown> {
  return gotrueAdmin("PUT", `/users/${userId}`, { password });
}

// Global sign-out: kills every session for the user. This project's GoTrue
// version exposes NO admin revocation endpoint (POST /admin/users/:id/logout
// and DELETE …/sessions both 404), so we revoke at the source of truth:
// auth.sessions rows, which getUser() validates against on every request —
// lockout lands on the target's very next request. refresh_tokens cascade.
export async function revokeAllSessions(userId: string): Promise<void> {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`delete from auth.sessions where user_id = ${userId}`);
}
