"use client";

import { useState } from "react";
import { formatAed } from "@/lib/money";
import { formatForeign, formatRateFromE6, isForeignCurrency } from "@/lib/currency";
import { Segmented } from "@/components/ui/segmented";

// The invoice document — REPLICATES THE CLIENT'S OWN SAMPLE LAYOUT exactly
// (DECISIONS.md Q-02 update 2026-07-05, supersedes the earlier Stamped Paper
// doc): logo block top-left with contact lines under it, big INVOICE title
// top-right with the address beneath, "Billed to" vs number/date/Paid lines,
// a single ruled grid (Item # / Description / Qty / Unit Price / Service Fee
// / [extras] / Amount), the totals stacked bottom-right, Terms & Conditions
// at the foot. Black-on-white in BOTH themes so screen matches print.
//
// Language (DECISIONS.md D-28, revised 2026-07-19): defaults to English;
// Arabic is a toggle — rendered instead of English, not alongside it. Both
// languages still share one render (`Section`), parameterised by a label
// dictionary + direction, so figures/dates/values are byte-identical
// whichever is selected. Directional spacing/alignment uses LOGICAL
// utilities (text-start/-end, pe-*) so the same markup mirrors correctly
// under rtl. Money & dates stay in Latin numerals in both languages (UAE
// FTA convention). The toggle is print:hidden and controls print output
// too, since it changes what's actually in the DOM — no separate print-only
// language logic needed.
//
// Rules that still bind inside this layout: sealed values are rendered
// verbatim (never recomputed); "Tax Invoice" title + TRN appear ONLY when
// the sealed snapshot says VAT-registered; JetBrains Mono for numerals.
// The logo block renders the company name until the real logo file arrives.

export type DocCompany = {
  name: string;
  nameAr: string | null;
  tagline: string | null;
  trn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bankDetails: string | null;
};
export type DocBillTo = {
  name: string;
  trn?: string | null;
  phone?: string | null;
  address?: string | null;
};
export type DocLine = {
  description: string;
  qty: number;
  govtFee: number; // "Unit Price" column, unit fils
  serviceFee: number;
  extraFees: number[]; // by column index, unit fils
};
export type DocTotals = {
  subtotalGovt: number;
  subtotalService: number;
  subtotalExtras: number;
  vatAmount: number;
  grandTotal: number;
};

type PayKey = "paid" | "partial" | "unpaid";

// A label dictionary — one per language. Values (numbers, dates, names,
// user-entered descriptions) are NOT translated; only fixed labels are.
type Labels = {
  invoice: string;
  taxInvoice: string;
  billedTo: string;
  addressPrefix: string;
  trn: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  paidHeading: string;
  atIssue: string;
  paid: Record<PayKey, string>;
  colItem: string;
  colDescription: string;
  colQty: string;
  colUnitPrice: string;
  colServiceFee: string;
  colAmount: string;
  vat: string; // short tag used in "(+X% …)" and the totals VAT row
  subtotal: string;
  serviceFeeTotal: string;
  otherCharges: string;
  totalAmount: string; // followed by the currency code
  exchangeRate: string;
  vatAed: string;
  totalAedEquivalent: string;
  termsHeading: string;
  thankYou: string;
  voided: string;
};

const EN: Labels = {
  invoice: "Invoice",
  taxInvoice: "Tax Invoice",
  billedTo: "Billed to",
  addressPrefix: "Address:",
  trn: "TRN",
  invoiceNumber: "Invoice number:",
  invoiceDate: "Invoice date:",
  currency: "Currency:",
  paidHeading: "Paid / Not Paid :",
  atIssue: "— at issue —",
  paid: { paid: "Paid", partial: "Partially Paid", unpaid: "Not Paid" },
  colItem: "Item #",
  colDescription: "Description",
  colQty: "Qty",
  colUnitPrice: "Unit Price",
  colServiceFee: "Service Fee",
  colAmount: "Amount",
  vat: "VAT",
  subtotal: "Subtotal:",
  serviceFeeTotal: "Service Fee:",
  otherCharges: "Other Charges:",
  totalAmount: "Total Amount",
  exchangeRate: "Exchange rate:",
  vatAed: "VAT (AED):",
  totalAedEquivalent: "Total (AED equivalent):",
  termsHeading: "Terms & Conditions",
  thankYou: "Thank you for Your Business",
  voided: "Voided",
};

const AR: Labels = {
  invoice: "فاتورة",
  taxInvoice: "فاتورة ضريبية",
  billedTo: "فاتورة إلى",
  addressPrefix: "العنوان:",
  trn: "الرقم الضريبي",
  invoiceNumber: "رقم الفاتورة:",
  invoiceDate: "تاريخ الفاتورة:",
  currency: "العملة:",
  paidHeading: "مدفوعة / غير مدفوعة :",
  atIssue: "— عند الإصدار —",
  paid: { paid: "مدفوعة", partial: "مدفوعة جزئياً", unpaid: "غير مدفوعة" },
  colItem: "م",
  colDescription: "الوصف",
  colQty: "الكمية",
  colUnitPrice: "سعر الوحدة",
  colServiceFee: "رسوم الخدمة",
  colAmount: "المبلغ",
  vat: "ض.ق.م",
  subtotal: "المجموع الفرعي:",
  serviceFeeTotal: "رسوم الخدمة:",
  otherCharges: "رسوم أخرى:",
  totalAmount: "المبلغ الإجمالي",
  exchangeRate: "سعر الصرف:",
  vatAed: "الضريبة (بالدرهم):",
  totalAedEquivalent: "الإجمالي (بالدرهم):",
  termsHeading: "الشروط والأحكام",
  thankYou: "شكراً لتعاملكم معنا",
  voided: "ملغاة",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function InvoiceDoc({
  company,
  vatRegistered,
  ratePct,
  number,
  status,
  issueDate,
  billTo,
  columns,
  lines,
  totals,
  notes,
  terms,
  paymentStatus,
  voidReason,
  displayCurrency = "AED",
  exchangeRateE6 = null,
}: {
  company: DocCompany;
  vatRegistered: boolean;
  ratePct: string;
  number: string | null;
  status: "draft" | "issued" | "voided";
  issueDate: string | null;
  billTo: DocBillTo;
  columns: { label: string; vatable: boolean }[];
  lines: DocLine[];
  totals: DocTotals;
  notes: string | null;
  terms: string | null;
  paymentStatus?: string | null;
  voidReason?: string | null;
  /** Foreign-currency DISPLAY layer (D-27). AED (default) renders unchanged; a
   *  foreign currency shows amounts derived from the sealed AED total, with the
   *  AED equivalent + rate shown for the total/VAT (AED stays the record). */
  displayCurrency?: string;
  exchangeRateE6?: number | null;
  /** kept for call-site compatibility; the sample layout has no issued-by block */
  issuedByName?: string | null;
  issuedAt?: string | null;
}) {
  const [language, setLanguage] = useState<"en" | "ar">("en");

  // AED-anchored: when a foreign currency + rate are set, money figures render
  // in that currency (derived from the sealed AED fils); otherwise plain AED.
  const foreign = isForeignCurrency(displayCurrency) && !!exchangeRateE6 && exchangeRateE6 > 0;
  const money = (fils: number) =>
    foreign ? formatForeign(fils, exchangeRateE6 as number) : formatAed(fils);
  const cur = foreign ? displayCurrency : "AED";
  const rateStr = foreign
    ? `1 ${displayCurrency} = ${formatRateFromE6(exchangeRateE6 as number)} AED`
    : "";
  const lineAmount = (l: DocLine) =>
    l.qty * (l.govtFee + l.serviceFee + l.extraFees.reduce((s, v) => s + v, 0));
  const payKey: PayKey | null =
    status !== "issued" || !paymentStatus
      ? null
      : paymentStatus === "paid"
        ? "paid"
        : paymentStatus === "partial"
          ? "partial"
          : "unpaid";
  const addressLines = (company.address ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const th = "border border-[#333] px-2 py-1.5 text-start text-[12px] font-semibold";
  const td = "border border-[#333] px-2 py-1.5 text-[12px]";
  const title = (L: Labels) => (vatRegistered ? L.taxInvoice : L.invoice);

  // One document body, rendered once per language. `dir` mirrors the whole
  // section under rtl; logical utilities keep alignment correct in both.
  const Section = (L: Labels, dir: "ltr" | "rtl", companyName: string, arabic: boolean) => (
    <section
      dir={dir}
      className={`break-inside-avoid ${arabic ? "font-arabic" : ""}`}
      lang={arabic ? "ar" : "en"}
    >
      {status === "voided" ? (
        <div className="mb-4 border-2 border-[#c2410c] px-3 py-2">
          <p className="mono text-[11px] font-semibold tracking-[0.14em] text-[#c2410c] uppercase">
            {L.voided}
            {voidReason ? ` — ${voidReason}` : ""}
          </p>
        </div>
      ) : null}

      {/* ── Header: logo block leading, INVOICE title + address trailing ── */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {/* Logo placeholder — swaps for the real logo file when provided */}
          <div className="inline-block bg-[#1a1a1a] px-5 py-3">
            <p className="text-[16px] leading-tight font-semibold text-white">{companyName}</p>
            {company.tagline ? (
              <p className="mt-0.5 text-[8px] tracking-[0.22em] text-white/80 uppercase">
                {company.tagline}
              </p>
            ) : null}
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10.5px] leading-snug">
            {company.phone
              ? company.phone.split("·").map((p, i) => (
                  <p key={i} className="mono" dir="ltr">
                    {p.trim()}
                    {i === 0 && company.email ? ` | ${company.email}` : ""}
                  </p>
                ))
              : null}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <h1 className="text-[34px] leading-none font-bold tracking-tight uppercase">
            {title(L)}
          </h1>
          <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug">
            {addressLines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          {vatRegistered && company.trn ? (
            <p className="mono mt-1 text-[11px]">
              {L.trn} {company.trn}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Billed to (leading) · number/date/paid (trailing) ── */}
      <div className="mt-12 mb-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[14px] font-bold">{L.billedTo}</p>
          <p className="text-[13px]">{billTo.name}</p>
          <p className="text-[10.5px] text-[#444]">
            {L.addressPrefix} {billTo.address ?? ""}
            {billTo.phone ? ` · ${billTo.phone}` : ""}
          </p>
          {billTo.trn ? (
            <p className="mono text-[10.5px] text-[#444]">
              {L.trn} {billTo.trn}
            </p>
          ) : null}
        </div>
        <table className="shrink-0 text-[13px]">
          <tbody>
            <tr>
              <td className="pe-4 text-end font-bold">{L.invoiceNumber}</td>
              <td className="mono text-end">{number ?? L.atIssue}</td>
            </tr>
            <tr>
              <td className="pe-4 text-end font-bold">{L.invoiceDate}</td>
              <td className="mono text-end">{fmtDate(issueDate)}</td>
            </tr>
            {foreign ? (
              <tr>
                <td className="pe-4 text-end font-bold">{L.currency}</td>
                <td className="mono text-end">{cur}</td>
              </tr>
            ) : null}
            <tr>
              <td className="pe-4 text-end font-bold">{L.paidHeading}</td>
              <td className="text-end">{payKey ? L.paid[payKey] : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── The ruled grid, exactly per the sample ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-12`}>{L.colItem}</th>
            <th className={th}>{L.colDescription}</th>
            <th className={`${th} w-14 text-center`}>{L.colQty}</th>
            <th className={`${th} w-24 text-end`}>{L.colUnitPrice}</th>
            <th className={`${th} w-24 text-end`}>
              {L.colServiceFee}
              {vatRegistered ? ` (+${ratePct}% ${L.vat})` : ""}
            </th>
            {columns.map((c, i) => (
              <th key={i} className={`${th} w-24 text-end`}>
                {c.label}
                {c.vatable && vatRegistered ? ` (+${ratePct}%)` : ""}
              </th>
            ))}
            <th className={`${th} w-28 text-end`}>{L.colAmount}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={idx}>
              <td className={`${td} mono`}>{idx + 1}</td>
              <td className={td}>{l.description || "—"}</td>
              <td className={`${td} mono text-center`}>{l.qty}</td>
              <td className={`${td} mono text-end`}>
                {l.govtFee > 0 ? money(l.qty * l.govtFee) : ""}
              </td>
              <td className={`${td} mono text-end`}>
                {l.serviceFee > 0 ? money(l.qty * l.serviceFee) : ""}
              </td>
              {columns.map((_, i) => (
                <td key={i} className={`${td} mono text-end`}>
                  {(l.extraFees[i] ?? 0) > 0 ? money(l.qty * (l.extraFees[i] ?? 0)) : ""}
                </td>
              ))}
              <td className={`${td} mono text-end font-semibold`}>{money(lineAmount(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals stack, bottom-trailing per the sample ── */}
      <div className="mt-6 flex justify-end">
        <table className="text-[13px]">
          <tbody>
            <tr>
              <td className="pe-6 text-end font-bold">{L.subtotal}</td>
              <td className="mono w-28 text-end">{money(totals.subtotalGovt)}</td>
            </tr>
            <tr>
              <td className="pe-6 text-end font-bold">{L.serviceFeeTotal}</td>
              <td className="mono text-end">{money(totals.subtotalService)}</td>
            </tr>
            {totals.subtotalExtras > 0 ? (
              <tr>
                <td className="pe-6 text-end font-bold">{L.otherCharges}</td>
                <td className="mono text-end">{money(totals.subtotalExtras)}</td>
              </tr>
            ) : null}
            {vatRegistered && totals.vatAmount > 0 ? (
              <tr>
                <td className="pe-6 text-end font-bold">
                  {L.vat} ({ratePct}%):
                </td>
                <td className="mono text-end">{money(totals.vatAmount)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="pt-1 pe-6 text-end text-[14px] font-bold">
                {L.totalAmount} {cur} :
              </td>
              <td className="mono pt-1 text-end text-[14px] font-bold">
                {money(totals.grandTotal)}
              </td>
            </tr>
            {/* FTA: a foreign-currency invoice must state the rate and the AED
                equivalent of the tax + total. AED remains the record of truth. */}
            {foreign ? (
              <>
                <tr>
                  <td className="pt-2 pe-6 text-end text-[10.5px] text-[#444]">{L.exchangeRate}</td>
                  <td className="mono pt-2 text-end text-[10.5px] text-[#444]" dir="ltr">
                    {rateStr}
                  </td>
                </tr>
                {vatRegistered && totals.vatAmount > 0 ? (
                  <tr>
                    <td className="pe-6 text-end text-[10.5px] text-[#444]">{L.vatAed}</td>
                    <td className="mono text-end text-[10.5px] text-[#444]">
                      {formatAed(totals.vatAmount)}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td className="pe-6 text-end text-[11px] font-bold text-[#444]">
                    {L.totalAedEquivalent}
                  </td>
                  <td className="mono text-end text-[11px] font-bold text-[#444]">
                    {formatAed(totals.grandTotal)}
                  </td>
                </tr>
              </>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── Terms & Conditions foot per the sample ── */}
      <div className="mt-14">
        <p className="text-[14px] font-bold">{L.termsHeading}</p>
        {terms ? <p className="mt-1 text-[12.5px]">{terms}</p> : null}
        {notes ? <p className="mt-1 text-[12.5px]">{notes}</p> : null}
        <p className="mt-3 text-[12.5px]">{L.thankYou}</p>
        {company.bankDetails ? (
          <p className="mono mt-2 text-[10.5px] text-[#444]" dir="ltr">
            {company.bankDetails}
          </p>
        ) : null}
      </div>
    </section>
  );

  return (
    <div>
      {/* Language toggle — controls preview AND print, since it changes
          what's actually in the DOM below. Defaults to English. */}
      <div className="mb-3 flex justify-end print:hidden">
        <Segmented
          aria-label="Invoice language"
          value={language}
          onChange={setLanguage}
          options={[
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
        />
      </div>

      <div className="print-doc relative border border-border bg-white p-8 text-[#111] print:border-0 print:p-0">
        {/* Screen-only seal — the printed document stays the client's exact
            sample layout; on screen the stamp makes immutability physical. */}
        {status === "issued" ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-10 right-10 rotate-[-1.5deg] border border-[#111]/60 px-3 py-1.5 outline outline-offset-3 outline-[#111]/60 select-none print:hidden"
          >
            <p className="mono text-[11px] font-bold tracking-[0.22em] text-[#111]/70 uppercase">
              · Sealed ·
            </p>
          </div>
        ) : null}

        {language === "en"
          ? Section(EN, "ltr", company.name, false)
          : Section(AR, "rtl", company.nameAr || company.name, true)}
      </div>
    </div>
  );
}
