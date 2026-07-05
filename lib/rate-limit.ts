// Minimal fixed-window rate limiter (task 7.3). In-memory and therefore
// PER-SERVERLESS-INSTANCE — an attacker spraying across cold starts gets a
// fresh window, so this is a brake, not a wall. It is keyed by USER ID (the
// protected routes all require a session), which an attacker cannot rotate
// cheaply, unlike an IP. Infra-level limits (Supabase Auth rate limits,
// Vercel WAF) are the outer layers — see FINDINGS.md 7.3.
// No new dependencies; the locked stack has no Redis (CLAUDE.md §2).

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns retry-after seconds when limited, or null when allowed. */
export function rateLimit(key: string, max: number, windowMs: number): number | null {
  const now = Date.now();
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 1000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > max) return Math.ceil((bucket.resetAt - now) / 1000);
  return null;
}
