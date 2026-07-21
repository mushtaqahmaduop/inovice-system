import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the recovery-link `code` for a session (PKCE flow) and hands
// off to `next` (default /update-password). This is the only place a
// Supabase auth link redirects to — it must stay public in middleware.ts.
// Only same-origin, single-slash absolute paths are honoured as `next`.
// Anything else (a full URL, a scheme-relative `//evil.com`, a path with a
// backslash) would be an open redirect off the back of a trusted auth link.
function safeNext(raw: string | null): string {
  const fallback = "/update-password";
  if (!raw) return fallback;
  // Must be an internal path: starts with a single "/", not "//" or "/\".
  if (!/^\/(?![/\\])/.test(raw)) return fallback;
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?reason=reset-link-invalid`);
}
