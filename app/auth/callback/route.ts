import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the recovery-link `code` for a session (PKCE flow) and hands
// off to `next` (default /update-password). This is the only place a
// Supabase auth link redirects to — it must stay public in middleware.ts.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/update-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?reason=reset-link-invalid`);
}
