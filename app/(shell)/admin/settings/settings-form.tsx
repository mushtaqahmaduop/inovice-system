"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { FieldLabel, FieldHint } from "@/components/ui/field";
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

// Company & Branding fields. Arabic name is RTL — used when a staff member
// toggles an invoice to Arabic (DECISIONS.md D-28, revised 2026-07-19:
// English is the default, Arabic is an explicit per-invoice choice).
const TEXT_FIELDS: {
  name: keyof FormValues;
  label: string;
  hint?: string;
  span2?: boolean;
  rtl?: boolean;
}[] = [
  { name: "companyName", label: "Company name *" },
  {
    name: "companyNameAr",
    label: "Company name (Arabic)",
    hint: "Printed on bilingual (English + Arabic) invoices.",
    rtl: true,
  },
  { name: "tagline", label: "Tagline", hint: "Displayed under the company name." },
  { name: "trn", label: "TRN", hint: "Used on invoices and reports as per UAE regulations." },
  { name: "address", label: "Address", span2: true },
  {
    name: "phone",
    label: "Phone",
    hint: "Multiple stations? Separate numbers with · (e.g. +971 50 986 0956 · +971 50 714 2037).",
  },
  {
    name: "email",
    label: "Email",
    hint: "Paired with phone numbers in the same order, also separated by ·.",
  },
  { name: "bankDetails", label: "Bank details", span2: true },
];

const SECTION =
  "rounded-[14px] border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const SECTION_LABEL = "mb-5 text-[11px] font-medium tracking-[0.08em] text-text-tertiary uppercase";
const TEXTAREA =
  "w-full rounded-[8px] border border-border-strong bg-surface p-2.5 text-[13px] leading-[19px] text-foreground transition-colors outline-none placeholder:text-text-tertiary focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken";

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
      toast.success("Settings saved");
      router.refresh();
    } else {
      setStatus("error");
      setServerError((await res.json().catch(() => null))?.error ?? "Save failed");
    }
  }

  const vatOn = form.watch("vatRegistered");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <section className={SECTION}>
        <p className={SECTION_LABEL}>VAT</p>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            {...form.register("vatRegistered")}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[14px] font-medium text-foreground">VAT registered</span>
            <span className="block text-[12px] leading-relaxed text-text-tertiary">
              Affects <strong>future</strong> invoices only — every issued invoice keeps the VAT
              state and rate sealed into it at issue time (D-16).
            </span>
          </span>
        </label>
        <div className="mt-4 w-40">
          <FieldLabel htmlFor="s-vatRatePct">VAT rate (%)</FieldLabel>
          <Input
            id="s-vatRatePct"
            {...form.register("vatRatePct")}
            disabled={!vatOn}
            inputMode="decimal"
            className="mono text-right text-[13px]"
          />
        </div>
      </section>

      <section className={SECTION}>
        <p className={SECTION_LABEL}>Invoices</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="s-format">Number format</FieldLabel>
            <Input
              id="s-format"
              {...form.register("invoiceNumberFormat")}
              className="mono text-[13px]"
            />
            <FieldHint>{"must contain {NN} (D-12)"}</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor="s-paper">Paper size</FieldLabel>
            <select
              id="s-paper"
              {...form.register("paperSize")}
              className="mono h-[38px] w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] text-foreground transition-colors outline-none focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
            >
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
            <FieldHint>PDF / thermal printers — A4 / A5.</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor="s-due">Default due days</FieldLabel>
            <Input
              id="s-due"
              {...form.register("dueDaysDefault")}
              inputMode="numeric"
              className="mono text-right text-[13px]"
            />
            <FieldHint>Invoice expiration — 10–120 days (Q-11: 7).</FieldHint>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="s-notes">Default invoice notes</FieldLabel>
            <textarea
              id="s-notes"
              {...form.register("invoiceNotesDefault")}
              rows={3}
              className={TEXTAREA}
            />
          </div>
          <div>
            <FieldLabel htmlFor="s-terms">Default terms</FieldLabel>
            <textarea
              id="s-terms"
              {...form.register("invoiceTermsDefault")}
              rows={3}
              className={TEXTAREA}
            />
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <p className={SECTION_LABEL}>Company &amp; Branding</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.name} className={f.span2 ? "sm:col-span-2" : ""}>
              <FieldLabel htmlFor={`s-${f.name}`}>{f.label}</FieldLabel>
              <Input
                id={`s-${f.name}`}
                {...form.register(f.name as "companyName")}
                dir={f.rtl ? "rtl" : undefined}
                className={`text-[13px] ${f.rtl ? "text-right" : ""}`}
              />
              {f.hint ? <FieldHint>{f.hint}</FieldHint> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-background px-1 py-3">
        {form.formState.isDirty && status === "idle" ? (
          <span className="text-[12px] text-text-tertiary">Unsaved changes</span>
        ) : null}
        {status === "saved" ? <span className="text-[13px] text-success">Saved.</span> : null}
        {serverError ? <span className="text-[13px] text-error">{serverError}</span> : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Save /> {form.formState.isSubmitting ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
