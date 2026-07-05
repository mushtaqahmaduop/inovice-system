"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsRow } from "./page";

// Form state is plain strings; the API's zod schema does the real
// validation and ""→null normalization. VAT toggle copy makes D-16
// explicit: future invoices only — issued ones carry their snapshots.
type FormValues = {
  companyName: string;
  companyNameAr: string;
  tagline: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  bankDetails: string;
  vatRegistered: boolean;
  vatRatePct: string; // UI in %, wire in basis points
  invoiceNumberFormat: string;
  paperSize: "A4" | "A5";
  invoiceNotesDefault: string;
  invoiceTermsDefault: string;
  dueDaysDefault: string;
};

const TEXT_FIELDS: { name: keyof FormValues; label: string; hint?: string }[] = [
  { name: "companyName", label: "Company name *" },
  { name: "companyNameAr", label: "Company name (Arabic)", hint: "pending Q-08" },
  { name: "tagline", label: "Tagline", hint: "printed under the company name" },
  { name: "trn", label: "TRN", hint: "kept during deregistration; not printed while unregistered" },
  { name: "address", label: "Address" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "bankDetails", label: "Bank details", hint: "invoice footer line" },
];

export function SettingsForm({ settings }: { settings: SettingsRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      companyName: settings.company_name,
      companyNameAr: settings.company_name_ar ?? "",
      tagline: settings.tagline ?? "",
      trn: settings.trn ?? "",
      address: settings.address ?? "",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      bankDetails: settings.bank_details ?? "",
      vatRegistered: settings.vat_registered,
      vatRatePct: (settings.vat_rate_bp / 100).toString(),
      invoiceNumberFormat: settings.invoice_number_format,
      paperSize: settings.paper_size === "A5" ? "A5" : "A4",
      invoiceNotesDefault: settings.invoice_notes_default ?? "",
      invoiceTermsDefault: settings.invoice_terms_default ?? "",
      dueDaysDefault: settings.due_days_default?.toString() ?? "",
    },
  });

  async function onSubmit(v: FormValues) {
    setStatus("idle");
    setServerError(null);
    const vatRateBp = Math.round(Number(v.vatRatePct) * 100);
    if (!Number.isFinite(vatRateBp) || vatRateBp < 0 || vatRateBp > 10000) {
      setServerError("VAT rate must be between 0 and 100%.");
      setStatus("error");
      return;
    }
    const dueDays = v.dueDaysDefault.trim() === "" ? null : Number(v.dueDaysDefault);
    if (dueDays !== null && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365)) {
      setServerError("Due days must be a whole number between 0 and 365.");
      setStatus("error");
      return;
    }
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: v.companyName,
        companyNameAr: v.companyNameAr,
        tagline: v.tagline,
        trn: v.trn,
        address: v.address,
        phone: v.phone,
        email: v.email,
        bankDetails: v.bankDetails,
        vatRegistered: v.vatRegistered,
        vatRateBp,
        invoiceNumberFormat: v.invoiceNumberFormat,
        paperSize: v.paperSize, // Q-07: A4 or A5, never thermal
        invoiceNotesDefault: v.invoiceNotesDefault,
        invoiceTermsDefault: v.invoiceTermsDefault,
        dueDaysDefault: dueDays,
      }),
    });
    if (res.ok) {
      setStatus("saved");
      router.refresh();
    } else {
      setStatus("error");
      setServerError((await res.json().catch(() => null))?.error ?? "Save failed");
    }
  }

  const vatOn = form.watch("vatRegistered");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <section className="border border-hairline bg-surface p-5">
        <p className="mono mb-4 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Company</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.name} className={f.name === "address" || f.name === "bankDetails" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-[11px] text-ink-3" htmlFor={`s-${f.name}`}>
                {f.label}
              </label>
              <Input id={`s-${f.name}`} {...form.register(f.name as "companyName")} className="h-8 text-[13px]" />
              {f.hint ? <p className="mt-0.5 text-[10px] text-ink-4">{f.hint}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="border border-hairline bg-surface p-5">
        <p className="mono mb-4 text-[9px] tracking-[0.16em] text-ink-3 uppercase">VAT</p>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" {...form.register("vatRegistered")} className="mt-0.5" />
          <span>
            <span className="block text-[13px] text-ink">VAT registered</span>
            <span className="block text-[11px] leading-relaxed text-ink-3">
              Affects <strong>future</strong> invoices only — every issued invoice keeps the VAT
              state and rate sealed into it at issue time (D-16).
            </span>
          </span>
        </label>
        <div className="mt-3 w-40">
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-vatRatePct">
            VAT rate (%)
          </label>
          <Input
            id="s-vatRatePct"
            {...form.register("vatRatePct")}
            disabled={!vatOn}
            inputMode="decimal"
            className="mono h-8 text-[13px]"
          />
        </div>
      </section>

      <section className="border border-hairline bg-surface p-5">
        <p className="mono mb-4 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Invoicing</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-format">
              Number format
            </label>
            <Input id="s-format" {...form.register("invoiceNumberFormat")} className="mono h-8 text-[13px]" />
            <p className="mt-0.5 text-[10px] text-ink-4">{"must contain {NN} (D-12)"}</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-paper">
              Paper size
            </label>
            <select
              id="s-paper"
              {...form.register("paperSize")}
              className="mono h-8 w-full rounded border border-hairline-strong bg-surface px-2 text-[13px] text-ink"
            >
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
            <p className="mt-0.5 text-[10px] text-ink-4">per Q-07 — the shop prints A4/A5</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-due">
              Default due days
            </label>
            <Input id="s-due" {...form.register("dueDaysDefault")} inputMode="numeric" className="mono h-8 text-[13px]" />
            <p className="mt-0.5 text-[10px] text-ink-4">overdue convention until Q-11</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-notes">
              Default invoice notes
            </label>
            <textarea
              id="s-notes"
              {...form.register("invoiceNotesDefault")}
              rows={3}
              className="w-full rounded border border-hairline-strong bg-transparent p-2 text-[13px] text-ink outline-none focus:border-ink-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="s-terms">
              Default terms
            </label>
            <textarea
              id="s-terms"
              {...form.register("invoiceTermsDefault")}
              rows={3}
              className="w-full rounded border border-hairline-strong bg-transparent p-2 text-[13px] text-ink outline-none focus:border-ink-3"
            />
          </div>
        </div>
        <p className="mt-3 text-[10px] text-ink-4">Logo upload lands with the print work (task 6.1).</p>
      </section>

      <div className="flex items-center justify-end gap-3">
        {status === "saved" ? <span className="text-[11px] text-success">Saved.</span> : null}
        {serverError ? <span className="text-[11px] text-destructive">{serverError}</span> : null}
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
