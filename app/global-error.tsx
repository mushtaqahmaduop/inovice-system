"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort boundary: catches failures in the ROOT LAYOUT itself, which
// app/error.tsx cannot — if the layout throws, there is no layout left to
// render an error inside. Next.js replaces the whole document with this, so it
// must ship its own <html>/<body>.
//
// Styles are inline on purpose. This renders in the one situation where the
// root layout did not run, so globals.css and the design tokens may never have
// been applied; a class-based version would render unstyled. The palette below
// mirrors the tokens by hand (CLAUDE.md §5) rather than importing them.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf9f7",
          color: "#1c1917",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "24rem",
            width: "100%",
            border: "1px solid #c2410c",
            background: "#ffffff",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 0.5rem",
              fontFamily: "ui-monospace, monospace",
              fontSize: "10px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#c2410c",
            }}
          >
            Processing error
          </p>
          <p style={{ margin: "0 0 1rem", fontSize: "13px", lineHeight: 1.6, color: "#57534e" }}>
            The application could not start. Nothing was written — no invoice or payment is
            affected. Reload the page, and tell the administrator if it happens again.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                color: "#a8a29e",
              }}
            >
              REF {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "1px solid #57534e",
              background: "#ffffff",
              color: "#1c1917",
              padding: "0.375rem 1rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
