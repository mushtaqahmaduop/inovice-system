"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
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
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = grandTotal - paidTotal;
  const overpaid = paidTotal > grandTotal;

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
      !window.confirm(
        `This exceeds the outstanding AED ${formatAed(Math.max(outstanding, 0))} — record an overpayment?`
      )
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
    <div className="mt-6 border border-hairline bg-surface p-4 print:hidden">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="mono text-[9px] tracking-[0.16em] text-ink-3 uppercase">Payments</p>
        <p className="text-[12px] text-ink-2">
          <span className="mono">{paymentStatus ?? "—"}</span>
          {" · paid "}
          <span className="mono">
            AED <AedFlow fils={paidTotal} />
          </span>
          {" of "}
          <span className="mono">AED {formatAed(grandTotal)}</span>
          {overpaid ? (
            <span className="text-warning">
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
        <div ref={listRef} className="mb-4 divide-y divide-hairline border border-hairline">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="mono w-24 text-[11.5px] text-ink-3">{p.received_on}</span>
              <span
                className={`mono w-28 text-right text-[12.5px] ${p.amount < 0 ? "text-warning" : "text-ink"}`}
              >
                {p.amount < 0 ? "−" : ""}AED {formatAed(Math.abs(p.amount))}
              </span>
              <span className="text-[11.5px] text-ink-2">{p.method_label}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
                {p.reference ?? ""}
              </span>
              {p.reverses_payment_id ? (
                <span className="mono text-[9px] tracking-[0.1em] text-warning uppercase">
                  reversal
                </span>
              ) : p.reversed ? (
                <span className="mono text-[9px] tracking-[0.1em] text-ink-4 uppercase line-through">
                  reversed
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reverse this payment? A negative correction row is added — history is never edited."
                      )
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
        <p className="mb-4 text-[12px] text-ink-3">No payments recorded yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="pay-amount">
            Amount (AED)
          </label>
          <Input
            id="pay-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={outstanding > 0 ? formatAed(outstanding).replace(/,/g, "") : "0.00"}
            className="mono h-8 w-32 text-right text-[12.5px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="pay-method">
            Method
          </label>
          <select
            id="pay-method"
            value={methodId}
            onChange={(e) => setMethodId(e.target.value)}
            className="h-8 rounded border border-hairline-strong bg-surface px-2 text-[12px] text-ink"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="pay-date">
            Received on
          </label>
          <Input
            id="pay-date"
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            className="mono h-8 w-40 text-[11.5px]"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="pay-ref">
            Reference (optional)
          </label>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-8 text-[12px]"
          />
        </div>
        <Button
          size="sm"
          onClick={record}
          disabled={busy || !methodId}
          className="w-full sm:w-auto"
        >
          {busy ? "Saving…" : "Record payment"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-[11px] text-warning">{error}</p> : null}
    </div>
  );
}
