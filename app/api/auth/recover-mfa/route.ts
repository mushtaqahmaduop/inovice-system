import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hashRecoveryCode } from "@/lib/auth/recovery-codes";

const bodySchema = z.object({ code: z.string().min(8).max(20) });

// POST — consume a one-time recovery code to unenroll the caller's TOTP
// factor (lost-authenticator flow, RUNBOOK-admin-mfa-recovery.md).
// Caller must hold a valid aal1 session (they know the password); the code
// proves possession of the enrollment-time secret. On success the factor is
// removed and the middleware routes the admin back through /mfa-setup.
//
// SERVICE-ROLE EXCEPTION (S-5.4): unenrolling a factor from an aal1 session
// is impossible with the user's own client — GoTrue requires aal2 to
// unenroll a verified factor. This admin-API call is the rare, explicitly
// justified use; identity still comes ONLY from the verified session.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const totpFactor = (user.factors ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );
  if (!totpFactor) {
    return NextResponse.json({ error: "No TOTP factor to recover." }, { status: 400 });
  }

  // Constant-shape lookup: hash the input, match an unused row of OUR OWN
  // (RLS-scoped) codes, and burn it in the same statement.
  const codeHash = hashRecoveryCode(parsed.data.code);
  const { data: burned, error: burnError } = await supabase
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .select("id");
  if (burnError) return NextResponse.json({ error: burnError.message }, { status: 500 });
  if (!burned?.length) {
    // Uniform failure: wrong code and already-used code look identical.
    await new Promise((r) => setTimeout(r, 750));
    return NextResponse.json({ error: "Invalid recovery code." }, { status: 403 });
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}/factors/${totpFactor.id}`,
    {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Could not unenroll the factor." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
