import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "@/lib/auth/recovery-codes";

// POST — (re)generate the caller's MFA recovery codes. Returns the plaintext
// codes exactly once; only hashes are stored. Requires a fully verified
// (aal2) session: codes are minted right after TOTP enrollment or from a
// future security-settings page, never from a half-authenticated session.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return NextResponse.json({ error: "MFA verification required." }, { status: 403 });
  }

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  // Old codes (used or not) are invalidated by regeneration. RLS scopes both
  // statements to the caller's own rows.
  const { error: delError } = await supabase
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", user.id);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  const { error: insError } = await supabase
    .from("mfa_recovery_codes")
    .insert(codes.map((c) => ({ user_id: user.id, code_hash: hashRecoveryCode(c) })));
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });

  return NextResponse.json({ codes });
}
