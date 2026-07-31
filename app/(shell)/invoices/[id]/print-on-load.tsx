"use client";

import { useEffect } from "react";

// Print-on-arrival: when the sealed view is reached with ?print=1, log the
// best-effort 'printed' event and open the browser print dialog once the
// layout/fonts have settled. Mirrors print-button.tsx, minus the button.
//
// The ONLY caller is the invoices list's row-level Print action — i.e. the
// operator already pressed a Print button and this page is just where the
// dialog has to open. Issuing deliberately does NOT come through here any
// more (client request 2026-07-30): the editor lands on the sealed invoice
// with no flag, and printing is a separate press of the Print button.
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
