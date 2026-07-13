"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { FieldLabel } from "@/components/ui/field";

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

  async function voidNow() {
    if (busy || !reason.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "void",
        reason: reason.trim(),
        createReplacement: withReplacement,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error ?? "Void failed");
      setBusy(false);
      return;
    }
    if (body?.replacementId) {
      toast.success("Invoice voided · replacement draft opened");
      router.push(`/invoices/${body.replacementId}/edit`);
    } else {
      toast.success("Invoice voided");
      router.refresh();
    }
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
    <Modal
      title="Void invoice"
      tone="danger"
      dismissable={!busy}
      onClose={() => setOpen(false)}
      description="The invoice keeps its number and sealed totals forever — voiding only marks it out of force. Corrections happen on a replacement document."
    >
      <div>
        <FieldLabel htmlFor="void-reason">Reason *</FieldLabel>
        <textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          className="w-full rounded-[8px] border border-border-strong bg-surface p-2.5 text-[14px] leading-[20px] text-foreground transition-colors outline-none focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
        />
      </div>
      <label className="mt-3 flex items-center gap-2.5 text-[13px] text-text-secondary">
        <input
          type="checkbox"
          checked={withReplacement}
          onChange={(e) => setWithReplacement(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        Create a replacement draft (copies the lines, links back)
      </label>
      <ModalFooter>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={voidNow} disabled={busy || !reason.trim()}>
          {busy ? "Voiding…" : "Void invoice"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
