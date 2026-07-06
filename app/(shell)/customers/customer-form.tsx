"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
// zodResolver's types pin a different zod 4.x minor than the repo's; the
// standard-schema resolver takes zod 4 through its Standard Schema interface.
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel, FieldError } from "@/components/ui/field";
import type { CustomerRow } from "./page";

export type DialogMode =
  { kind: "regular" } | { kind: "walk_in" } | { kind: "edit"; row: CustomerRow };

// Form-local schema: plain optional strings (the API normalizes "" → null
// server-side via the shared customer schemas — the wire format stays thin).
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: z.string().trim().max(50).optional(),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), { message: "Invalid email" }),
  trn: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof formSchema>;

const FIELDS: { name: keyof FormValues; label: string; walkIn: boolean }[] = [
  { name: "name", label: "Name", walkIn: true },
  { name: "phone", label: "Phone", walkIn: true },
  { name: "email", label: "Email", walkIn: false },
  { name: "trn", label: "TRN", walkIn: false },
  { name: "address", label: "Address", walkIn: false },
  { name: "notes", label: "Notes", walkIn: false },
];

export function CustomerFormDialog({
  mode,
  onClose,
  onSaved,
}: {
  mode: DialogMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const isWalkIn = mode.kind === "walk_in" || (mode.kind === "edit" && mode.row.type === "walk_in");
  const editing = mode.kind === "edit" ? mode.row : null;

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(formSchema),
    defaultValues: {
      name: editing?.name ?? "",
      phone: editing?.phone ?? "",
      email: editing?.email ?? "",
      trn: editing?.trn ?? "",
      address: editing?.address ?? "",
      notes: editing?.notes ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v === "" ? null : v])
    );
    const res = editing
      ? await fetch(`/api/customers/${editing.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", data: payload }),
        })
      : await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            type: mode.kind === "walk_in" ? "walk_in" : "regular",
          }),
        });
    if (res.ok) onSaved();
    else setServerError((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  const title =
    mode.kind === "edit"
      ? `Edit ${isWalkIn ? "walk-in" : "client"}`
      : mode.kind === "walk_in"
        ? "Quick add walk-in"
        : "Add regular client";
  const visibleFields = FIELDS.filter((f) => (isWalkIn && mode.kind !== "edit" ? f.walkIn : true));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md border border-hairline-strong bg-surface p-5 shadow-lg">
        <p className="mono mb-4 text-[10px] tracking-[0.14em] text-ink-3 uppercase">{title}</p>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {visibleFields.map((f) => (
            <div key={f.name}>
              <FieldLabel htmlFor={`cf-${f.name}`}>
                {f.label}
                {f.name === "name" ? " *" : ""}
              </FieldLabel>
              <Input
                id={`cf-${f.name}`}
                {...form.register(f.name)}
                className={`text-[13px] ${form.formState.errors[f.name] ? "border-warning" : ""}`}
                autoFocus={f.name === "name"}
              />
              {form.formState.errors[f.name] ? (
                <FieldError>{form.formState.errors[f.name]?.message}</FieldError>
              ) : null}
            </div>
          ))}
          {serverError ? <FieldError>{serverError}</FieldError> : null}
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
