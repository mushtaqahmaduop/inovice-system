"use client";

import { Button } from "@/components/ui/button";

// Print (task 4.2/[#23a]). Logs the best-effort 'printed' event — print
// REQUESTED, never confirmed (SCHEMA_DESIGN §2.11) — then opens the browser
// dialog. Print CSS keeps the shell out of the page.
export function PrintButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void fetch(`/api/invoices/${invoiceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "log_print" }),
        }).catch(() => {});
        window.print();
      }}
    >
      Print
    </Button>
  );
}
