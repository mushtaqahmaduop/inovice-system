"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { FieldLabel, FieldError } from "@/components/ui/field";
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
    if (res.ok) {
      toast.success(row ? "Service updated" : "Service added");
      onSaved();
    } else setServerError((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  return (
    <Modal title={row ? "Edit service" : "Add service"} onClose={onClose} size="sm">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <FieldLabel htmlFor="sv-name">Name *</FieldLabel>
          <Input id="sv-name" {...form.register("name")} autoFocus />
        </div>
        <div>
          <FieldLabel htmlFor="sv-unit">Unit (person, page, doc…)</FieldLabel>
          <Input id="sv-unit" {...form.register("unit")} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <FieldLabel htmlFor="sv-govt">Govt fee (AED)</FieldLabel>
            <Input
              id="sv-govt"
              {...form.register("govtFeeAed")}
              inputMode="decimal"
              className="mono text-right"
            />
          </div>
          <div className="flex-1">
            <FieldLabel htmlFor="sv-svc">Service fee (AED)</FieldLabel>
            <Input
              id="sv-svc"
              {...form.register("serviceFeeAed")}
              inputMode="decimal"
              className="mono text-right"
            />
          </div>
        </div>
        {serverError ? <FieldError>{serverError}</FieldError> : null}
        <ModalFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
