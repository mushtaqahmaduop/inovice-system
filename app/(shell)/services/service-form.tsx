"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aedToFils, formatAed } from "@/lib/money";
import type { ServiceRow } from "./page";

// Create/edit a catalogue service. Fee inputs are AED strings converted to
// integer fils at the boundary (lib/money.ts) — >2 decimals rejected; the
// wire and the DB only ever see integers (CLAUDE.md §3.3).
type FormValues = { name: string; unit: string; govtFeeAed: string; serviceFeeAed: string };

export function ServiceFormDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ServiceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      name: row?.name ?? "",
      unit: row?.unit ?? "unit",
      govtFeeAed: row ? formatAed(row.govt_fee).replace(/,/g, "") : "0.00",
      serviceFeeAed: row ? formatAed(row.service_fee).replace(/,/g, "") : "0.00",
    },
  });

  async function onSubmit(v: FormValues) {
    setServerError(null);
    if (!v.name.trim()) return setServerError("Name is required.");
    if (!v.unit.trim()) return setServerError("Unit is required.");
    const govtFee = aedToFils(v.govtFeeAed);
    const serviceFee = aedToFils(v.serviceFeeAed);
    if (govtFee === null || serviceFee === null) {
      return setServerError("Fees must be amounts in AED with at most 2 decimals.");
    }
    const res = row
      ? await fetch(`/api/services/${row.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            data: { name: v.name.trim(), unit: v.unit.trim(), govtFee, serviceFee },
          }),
        })
      : await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: v.name.trim(), unit: v.unit.trim(), govtFee, serviceFee }),
        });
    if (res.ok) onSaved();
    else setServerError((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={row ? "Edit service" : "Add service"}
    >
      <div className="w-full max-w-sm border border-hairline-strong bg-surface p-5 shadow-lg">
        <p className="mono mb-4 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
          {row ? "Edit service" : "Add service"}
        </p>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="sv-name">
              Name *
            </label>
            <Input id="sv-name" {...form.register("name")} className="h-8 text-[13px]" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="sv-unit">
              Unit (person, page, doc…)
            </label>
            <Input id="sv-unit" {...form.register("unit")} className="h-8 text-[13px]" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-ink-3" htmlFor="sv-govt">
                Govt fee (AED)
              </label>
              <Input id="sv-govt" {...form.register("govtFeeAed")} inputMode="decimal" className="mono h-8 text-[13px]" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-ink-3" htmlFor="sv-svc">
                Service fee (AED)
              </label>
              <Input id="sv-svc" {...form.register("serviceFeeAed")} inputMode="decimal" className="mono h-8 text-[13px]" />
            </div>
          </div>
          {serverError ? <p className="text-[11px] text-destructive">{serverError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
