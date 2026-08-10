import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {/* config options here */};

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
