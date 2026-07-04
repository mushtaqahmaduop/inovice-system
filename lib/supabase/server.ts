import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// User-scoped server client for Server Components, Server Actions and Route
// Handlers. Identity always comes from the verified session (CLAUDE.md §4);
// the service-role key is NEVER used here (SCHEMA_DESIGN §5 / S-5.4).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie writes are handled by
            // the middleware refresh instead.
          }
        },
      },
    }
  );
}
