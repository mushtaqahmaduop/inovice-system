"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Save, Plus, Trash2 } from "lucide-react";
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
  { name: "bankDetails", label: "Bank details", span2: true },
];

// Phone/email are stored as " · "-joined strings (station N's phone pairs
// with station N's email on the invoice). The form edits them as ordered
// pairs so no one has to type a middot; row order = print priority.
type Station = { phone: string; email: string };

function splitStations(phone: string, email: string): Station[] {
  const phones = phone ? phone.split("·").map((p) => p.trim()) : [];
  const emails = email ? email.split("·").map((e) => e.trim()) : [];
  const n = Math.max(phones.length, emails.length);
  const rows: Station[] = [];
  for (let i = 0; i < n; i++) rows.push({ phone: phones[i] ?? "", email: emails[i] ?? "" });
  return rows.length ? rows : [{ phone: "", email: "" }];
}

// Drop fully-empty rows, then join each column with " · " in row order.
function joinStations(rows: Station[]): { phone: string; email: string } {
  const kept = rows.filter((r) => r.phone.trim() !== "" || r.email.trim() !== "");
  return {
    phone: kept.map((r) => r.phone.trim()).join(" · "),
    email: kept.map((r) => r.email.trim()).join(" · "),
  };
}

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

  // Station rows drive the phone/email form values. Writing back through
  // setValue with shouldDirty keeps the "Unsaved changes" indicator and the
  // submit path (which reads v.phone / v.email) working unchanged.
  const [stations, setStations] = useState<Station[]>(() =>
    splitStations(settings.phone ?? "", settings.email ?? "")
  );

  function updateStations(next: Station[]) {
    setStations(next);
    const { phone, email } = joinStations(next);
    form.setValue("phone", phone, { shouldDirty: true });
    form.setValue("email", email, { shouldDirty: true });
  }

  const setStation = (i: number, patch: Partial<Station>) =>
    updateStations(stations.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStation = () => updateStations([...stations, { phone: "", email: "" }]);
  const removeStation = (i: number) =>
    updateStations(
      stations.length === 1 ? [{ phone: "", email: "" }] : stations.filter((_, idx) => idx !== i)
    );

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

        {/* Contact stations — paired phone + email, in print priority order.
            Replaces the old middot-delimited single fields (owner request). */}
        <div className="mt-6">
          <div className="mb-1 flex items-center justify-between">
            <FieldLabel htmlFor="station-0-phone">Contact stations</FieldLabel>
            <span className="text-[11px] text-text-tertiary">
              Topmost prints first on the invoice
            </span>
          </div>
          <div className="space-y-2">
            {stations.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mono mt-2.5 w-4 shrink-0 text-[11px] text-text-tertiary">
                  {i + 1}
                </span>
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    id={`station-${i}-phone`}
                    value={s.phone}
                    onChange={(e) => setStation(i, { phone: e.target.value })}
                    inputMode="tel"
                    placeholder="+971 50 986 0956"
                    className="text-[13px]"
                  />
                  <Input
                    id={`station-${i}-email`}
                    value={s.email}
                    onChange={(e) => setStation(i, { email: e.target.value })}
                    type="email"
                    placeholder="name@example.com"
                    className="text-[13px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStation(i)}
                  aria-label={`Remove station ${i + 1}`}
                  title="Remove station"
                  className="mt-1 rounded-[8px] p-1.5 text-text-tertiary transition-colors hover:bg-neutral-soft hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStation}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
          >
            <Plus className="size-4" /> Add station
          </button>
          <FieldHint>Each station pairs a phone with the email beside it on the invoice.</FieldHint>
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
