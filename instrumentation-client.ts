// Sentry — browser runtime. Next.js loads this file automatically on the
// client (the successor to sentry.client.config.ts).
//
// Uses NEXT_PUBLIC_SENTRY_DSN because this value is compiled into the bundle
// and is therefore public by definition. A Sentry DSN is write-only — it can
// submit events, never read them — so exposure is expected, not a leak.
//
// Session Replay is deliberately NOT enabled: it would record invoice screens
// containing customer names, TRNs and amounts.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request?.query_string) delete event.request.query_string;
      return event;
    },
  });
}

// Reports slow/failed client-side navigations to Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
