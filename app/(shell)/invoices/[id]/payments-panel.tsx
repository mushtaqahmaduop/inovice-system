"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FieldLabel, FieldError } from "@/components/ui/field";
import { StatusChip, type ChipVariant } from "@/components/ui/status-chip";
import { AedFlow } from "@/components/ui/aed-flow";
import { aedToFils, formatAed } from "@/lib/money";

export type PaymentRow = {
  id: string;
  amount: number;
  received_on: string;
  reference: string | null;
  reverses_payment_id: string | null;
  method_label: string;
  reversed: boolean; // a reversal row exists pointing at this payment
};
export type MethodOption = { id: string; label: string };

// Payments panel (task 5.1) on the sealed invoice view. Status is read
// from the invoice_list view upstream — this panel only ever INSERTS
// (records and reversal rows); nothing here mutates history.
export function PaymentsPanel({
  invoiceId,
  payments,
  methods,
  paidTotal,
  grandTotal,
  paymentStatus,
}: {
  invoiceId: string;
  payments: PaymentRow[];
  methods: MethodOption[];
  paidTotal: number;
  grandTotal: number;
  paymentStatus: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = grandTotal - paidTotal;
  const overpaid = paidTotal > grandTotal;

  // Human-readable status pill (owner: the raw "partial/unpaid" word wasn't a
  // clear clue). Amounts below still spell out exactly what's left.
  const statusPill: { variant: ChipVariant; label: string } = overpaid
    ? { variant: "warning", label: "Overpaid" }
    : paymentStatus === "paid"
      ? { variant: "success", label: "Paid in full" }
      : paymentStatus === "partial"
        ? { variant: "warning", label: "Partially paid" }
        : { variant: "neutral", label: "Unpaid" };

  async function call(body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    toast.error((await res.json().catch(() => null))?.error ?? "Request failed");
    return false;
  }

  async function record() {
    const fils = aedToFils(amount);
    if (fils === null || fils === 0) {
      setError("Enter a positive AED amount (max 2 decimals).");
      return;
    }
    if (
      fils > outstanding &&
      !(await confirm({
        title: "Record an overpayment?",
        description: `This exceeds the outstanding AED ${formatAed(Math.max(outstanding, 0))}.`,
        confirmLabel: "Record overpayment",
      }))
    )
      return;
    if (
      await call({
        type: "record",
        amount: fils,
        methodId,
        receivedOn,
        reference: reference || null,
      })
    ) {
      setAmount("");
      setReference("");
      toast.success(`Payment recorded · AED ${formatAed(fils)}`);
    }
  }

  return (
    <div className="mt-6 rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] print:hidden">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">Payments</h2>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-secondary">
          <StatusChip variant={statusPill.variant}>{statusPill.label}</StatusChip>
          {" paid "}
          <span className="mono">
            AED <AedFlow fils={paidTotal} />
          </span>
          {" of "}
          <span className="mono">AED {formatAed(grandTotal)}</span>
          {overpaid ? (
            <span className="text-danger">
              {" "}
              · overpaid by AED <AedFlow fils={paidTotal - grandTotal} className="mono" />
            </span>
          ) : outstanding > 0 ? (
            <>
              {" "}
              · outstanding{" "}
              <span className="mono">
                AED <AedFlow fils={outstanding} />
              </span>
            </>
          ) : null}
        </p>
      </div>

      {payments.length > 0 ? (
        <div
          ref={listRef}
          className="mb-4 divide-y divide-border overflow-hidden rounded-[10px] border border-border"
        >
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="mono w-24 text-[11.5px] text-text-tertiary">{p.received_on}</span>
              <span
                className={`mono w-28 text-right text-[12.5px] ${p.amount < 0 ? "text-danger" : "text-foreground"}`}
              >
                {p.amount < 0 ? "−" : ""}AED {formatAed(Math.abs(p.amount))}
              </span>
              <span className="text-[11.5px] text-text-secondary">{p.method_label}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">
                {p.reference ?? ""}
              </span>
              {p.reverses_payment_id ? (
                <span className="mono text-[9px] tracking-[0.1em] text-danger uppercase">
                  reversal
                </span>
              ) : p.reversed ? (
                <span className="mono text-[9px] tracking-[0.1em] text-text-tertiary uppercase line-through">
                  reversed
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Reverse this payment?",
                        description:
                          "A negative correction row is added — history is never edited.",
                        confirmLabel: "Reverse",
                        tone: "danger",
                      })
                    )
                      void call({ type: "reverse", paymentId: p.id }).then((ok) => {
                        if (ok) toast.success("Payment reversed");
                      });
                  }}
                >
                  Reverse
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-[12px] text-text-tertiary">No payments recorded yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div>
          <FieldLabel htmlFor="pay-amount">Amount (AED)</FieldLabel>
          <Input
            id="pay-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={outstanding > 0 ? formatAed(outstanding).replace(/,/g, "") : "0.00"}
            className="mono w-32 text-right"
          />
        </div>
        <div>
          <FieldLabel htmlFor="pay-method">Method</FieldLabel>
          <SelectNative
            id="pay-method"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            className="w-40"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </SelectNative>
        </div>
        <div>
          <FieldLabel htmlFor="pay-date">Received on</FieldLabel>
          <Input
            id="pay-date"
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            className="mono w-40"
          />
        </div>
        <div className="min-w-40 flex-1">
          <FieldLabel htmlFor="pay-ref">Reference (optional)</FieldLabel>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <Button onClick={record} disabled={busy || !methodId} className="w-full sm:w-auto">
          {busy ? "Saving…" : "Record payment"}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
