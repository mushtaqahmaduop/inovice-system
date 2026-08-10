// Sentry — Node.js server runtime (task 7.2, audit F-2).
//
// Loaded by instrumentation.ts's register() when NEXT_RUNTIME === "nodejs".
//
// INERT WITHOUT A DSN. Until an account exists and SENTRY_DSN is set in Vercel,
// init() is never called and the SDK does nothing at all — no network, no
// overhead, no build failure. That is deliberate: the wiring lands now so the
// only remaining step is pasting a credential.
//
// PII: this application handles customer names, TRNs and invoice amounts.
// `sendDefaultPii` stays FALSE so Sentry never receives request bodies,
// cookies or headers by default, and beforeSend strips query strings, which
// are the one place a customer id can leak into a URL.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",

    // Errors are the point. Tracing on a 10-user internal tool is noise that
    // burns quota — keep a token sample for slow-request visibility only.
    tracesSampleRate: 0.1,

    // Never send request bodies, cookies or headers. See PII note above.
    sendDefaultPii: false,

    beforeSend(event) {
      // A query string can carry a customer or invoice id. Drop it; the route
      // pattern is what makes an error diagnosable, not the identifier.
      if (event.request?.query_string) delete event.request.query_string;
      return event;
    },
  });
}
