// Sentry — Edge runtime (middleware.ts runs here).
//
// Same contract as sentry.server.config.ts: inert without a DSN, no PII.
// Middleware is the auth gate, so its failures are worth seeing — a broken
// session check would otherwise present as users being silently logged out.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request?.query_string) delete event.request.query_string;
      return event;
    },
  });
}
