"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Print (task 4.2/[#23a]). Logs the best-effort 'printed' event — print
// REQUESTED, never confirmed (SCHEMA_DESIGN §2.11) — then opens the browser
// dialog. Print CSS keeps the shell out of the page.
//
// Accent-filled since 2026-07-30 (owner: the outline button was too faint).
// It is the primary action on a sealed invoice now that issuing no longer
// prints on its own.
export function PrintButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Button
      size="sm"
      onClick={() => {
        void fetch(`/api/invoices/${invoiceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "log_print" }),
        }).catch(() => {});
        window.print();
      }}
    >
      <Printer /> Print
    </Button>
  );
}
