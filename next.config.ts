import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ── Security headers (audit F-4) ──────────────────────────────────────────
//
// Before this, the app sent none: an application that displays sealed invoices
// could be framed by any site (clickjacking) and would MIME-sniff responses.
// Only Vercel's default HSTS was present.
//
// The Supabase origin has to appear in the policy because the browser talks to
// it directly — PostgREST over https and Realtime (presence, the sidebar's
// online-employees strip) over wss. It is read from the public env var, which
// Next loads before evaluating this file.
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

const isDev = process.env.NODE_ENV !== "production";

function contentSecurityPolicy(origin: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Clickjacking: the modern equivalent of X-Frame-Options, which is also
    // sent below for older browsers. Nothing may frame this app, ever.
    "frame-ancestors 'none'",
    // A form can only post back to us — an injected form cannot exfiltrate a
    // customer's details to another host.
    "form-action 'self'",
    "img-src 'self' data: blob: " + origin,
    // next/font/google self-hosts at build time, so fonts come from /_next.
    "font-src 'self'",
    // Inline styles are required: React style attributes (app/global-error.tsx
    // renders with them by necessity) and Next's critical-CSS inlining. Inline
    // STYLE is a far smaller risk than inline script.
    "style-src 'self' 'unsafe-inline'",
    // HONEST LIMITATION: 'unsafe-inline' remains here because Next injects
    // inline bootstrap/hydration scripts. Removing it requires a per-request
    // nonce threaded through middleware — middleware is the auth gate, so that
    // change deserves its own branch and its own testing, not a ride-along.
    // What this policy DOES buy today: an injected `<script src="evil.com">`
    // is blocked outright, as is object/embed, base-tag hijacking and
    // cross-origin form posting.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Supabase REST + Realtime, plus 'self' for the Sentry tunnel (/monitoring).
    `connect-src 'self' ${origin} ${origin.replace(/^https:/, "wss:")}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // This app needs none of these. Denying them means a compromised page
    // cannot silently reach for a camera, a microphone or a location.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    // FAIL OPEN, deliberately. If the Supabase origin cannot be resolved at
    // build time, a CSP built without it would block every auth and data call
    // and take the shop offline. The four headers above are unconditional; the
    // CSP is skipped rather than shipped wrong. A missing env var at build
    // time is already a broken deploy — this just refuses to make it worse.
    const csp = supabaseOrigin
      ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseOrigin) }]
      : [];

    return [{ source: "/:path*", headers: [...securityHeaders, ...csp] }];
  },
};

// Sentry build plugin (task 7.2, audit F-2).
//
// Source-map upload only happens when SENTRY_AUTH_TOKEN + org/project are set;
// without them the plugin skips it and the build still succeeds, which is what
// keeps this safe to merge before the Sentry account exists. Set the token in
// Vercel (not in the repo) to get readable stack traces instead of minified
// ones — errors are still captured either way.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Build logs stay quiet unless something actually fails.
  silent: !process.env.CI,

  // Routes browser error reports through /monitoring on our own origin, so ad
  // blockers cannot silently swallow them. Adds a Next.js rewrite.
  tunnelRoute: "/monitoring",

  // Deliberately NOT set: `disableLogger` and `automaticVercelMonitors`. Both
  // are deprecated in SDK 10 and both are webpack-only — this project builds
  // with `next build --turbopack`, so setting them does nothing except print a
  // deprecation warning on every build.
});
