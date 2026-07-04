import { createBrowserClient } from "@supabase/ssr";

// Browser client — login form, MFA enrollment/challenge. Anon key only.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
