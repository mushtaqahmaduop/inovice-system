// Next.js instrumentation hook — the SDK's server/edge entry point (task 7.2).
//
// register() runs once per runtime at boot. onRequestError is what actually
// closes audit F-2: it reports every uncaught server-side error — Server
// Components, route handlers, server actions — which is precisely the class of
// failure that used to reach a customer and tell nobody.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
