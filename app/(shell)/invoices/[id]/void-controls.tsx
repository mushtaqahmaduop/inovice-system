"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Void an issued invoice (task 4.4, admin only — the API and the DB
// function both re-enforce that). Reason is mandatory; optionally spawn a
// replacement draft that copies the lines and links back via
// replaces_invoice_id.
export function VoidControls({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [withReplacement, setWithReplacement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function voidNow() {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", reason: reason.trim(), createReplacement: withReplacement }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Void failed");
      setBusy(false);
      return;
    }
    if (body?.replacementId) router.push(`/invoices/${body.replacementId}/edit`);
    else router.refresh();
    setOpen(false);
    setBusy(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Void…
      </Button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Void invoice"
    >
      <div className="w-full max-w-md border border-hairline-strong bg-surface p-5 shadow-lg">
        <p className="mono mb-2 text-[10px] tracking-[0.14em] text-warning uppercase">
          Void invoice
        </p>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-2">
          The invoice keeps its number and sealed totals forever — voiding only marks it out of
          force. Corrections happen on a replacement document.
        </p>
        <label className="mb-1 block text-[11px] text-ink-3" htmlFor="void-reason">
          Reason *
        </label>
        <textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          className="w-full rounded border border-hairline-strong bg-transparent p-2 text-[12.5px] text-ink outline-none focus:border-ink-3"
        />
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={withReplacement}
            onChange={(e) => setWithReplacement(e.target.checked)}
          />
          Create a replacement draft (copies the lines, links back)
        </label>
        {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={voidNow} disabled={busy || !reason.trim()}>
            {busy ? "Voiding…" : "Void invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
