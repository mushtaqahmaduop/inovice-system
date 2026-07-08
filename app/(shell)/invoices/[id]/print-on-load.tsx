"use client";

import { useEffect } from "react";

// Auto-print after issue (owner request): when the sealed view is reached
// with ?print=1 (the editor redirects there on issue), log the best-effort
// 'printed' event and open the browser print dialog once the layout/fonts
// have settled. Mirrors print-button.tsx, minus the button.
export function PrintOnLoad({ invoiceId }: { invoiceId: string }) {
  useEffect(() => {
    void fetch(`/api/invoices/${invoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_print" }),
    }).catch(() => {});
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [invoiceId]);
  return null;
}
