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
  taglineAr: string | null;
  trn: string | null;
  address: string | null;
  addressAr: string | null;
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
  amountPaid: string;
  balanceDue: string;
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
  inclusiveVat: string; // customer copy: "Total is inclusive of VAT" note
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
  billedTo: "Bill to",
  addressPrefix: "Address:",
  trn: "TRN",
  invoiceNumber: "Invoice number:",
  invoiceDate: "Invoice date:",
  currency: "Currency:",
  paidHeading: "Payment Status :",
  atIssue: "— at issue —",
  paid: { paid: "Paid", partial: "Partially Paid", unpaid: "Not Paid" },
  amountPaid: "Amount Paid:",
  balanceDue: "Balance Due:",
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
  inclusiveVat: "Total is inclusive of VAT",
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
  paidHeading: "حالة الدفع :",
  atIssue: "— عند الإصدار —",
  paid: { paid: "مدفوعة", partial: "مدفوعة جزئياً", unpaid: "غير مدفوعة" },
  amountPaid: "المبلغ المدفوع:",
  balanceDue: "المبلغ المتبقي:",
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
  inclusiveVat: "الإجمالي شامل ضريبة القيمة المضافة",
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
  paidTotal = 0,
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
  /** AED fils already received — drives the Amount Paid / Balance Due rows
   *  shown on a partial or unpaid issued invoice. */
  paidTotal?: number;
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
  // Which rendering of the SAME sealed invoice to show (owner request
  // 2026-07-23). "customer" = the copy handed to the customer: one blended,
  // VAT-inclusive amount per line and a single grand total, with the
  // government/service split and the VAT figure hidden so the customer cannot
  // see (and argue down) the service fee. "fta" = the full detailed copy for
  // the books. Defaults to the customer copy — the one printed at point of
  // sale — and, like the language toggle, controls print output too.
  const [copy, setCopy] = useState<"customer" | "fta">("customer");

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
  // Customer-copy per-line amounts: the sealed net blended amount plus the
  // sealed VAT distributed across the lines (proportional to each line's
  // VAT-able base, largest-remainder), so the displayed lines sum EXACTLY to
  // the sealed grand total. This is a DISPLAY layer only (cf. D-27 foreign
  // currency) — no sealed money is recomputed or altered; hiding the separate
  // VAT row must not leave a visible gap that would leak the service fee.
  const custLineAmounts: number[] = (() => {
    const nets = lines.map(lineAmount);
    const out = nets.slice();
    const vat = vatRegistered ? totals.vatAmount : 0;
    if (vat > 0 && nets.length > 0) {
      const base = (l: DocLine) =>
        l.qty *
        (l.serviceFee + l.extraFees.reduce((s, v, i) => s + (columns[i]?.vatable ? v : 0), 0));
      const bases = lines.map(base);
      const totalBase = bases.reduce((s, v) => s + v, 0);
      if (totalBase > 0) {
        const raw = bases.map((b) => (vat * b) / totalBase);
        const share = raw.map((r) => Math.floor(r));
        let leftover = vat - share.reduce((s, v) => s + v, 0);
        const order = raw
          .map((r, i) => ({ i, frac: r - Math.floor(r) }))
          .sort((a, b) => b.frac - a.frac);
        for (let k = 0; k < order.length && leftover > 0; k++, leftover--) share[order[k].i] += 1;
        for (let i = 0; i < out.length; i++) out[i] = nets[i] + share[i];
      }
    }
    // Absorb any residual (e.g. seal rounding) into the last line so the copy
    // always foots to the exact sealed grand total.
    const delta = totals.grandTotal - out.reduce((s, v) => s + v, 0);
    if (delta !== 0 && out.length > 0) out[out.length - 1] += delta;
    return out;
  })();
  const payKey: PayKey | null =
    status !== "issued" || !paymentStatus
      ? null
      : paymentStatus === "paid"
        ? "paid"
        : paymentStatus === "partial"
          ? "partial"
          : "unpaid";
  // Arrears: on a partial or unpaid issued invoice, spell out what was paid
  // and what remains. AED fils in, rendered in the display currency.
  const paidFils = status === "issued" ? paidTotal : 0;
  const outstandingFils = totals.grandTotal - paidFils;
  const showArrears = payKey === "partial" || payKey === "unpaid";
  // Company header text is language-specific: the Arabic copy uses the Arabic
  // tagline/address when set, falling back to the English value otherwise.
  const addrLines = (v: string | null) =>
    (v ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const th = "border border-[#333] px-2 py-1.5 text-start text-[12px] font-semibold";
  const td = "border border-[#333] px-2 py-1.5 text-[12px]";
  const title = (L: Labels) => (vatRegistered ? L.taxInvoice : L.invoice);

  // One document body, rendered once per language. `dir` mirrors the whole
  // section under rtl; logical utilities keep alignment correct in both.
  const Section = (
    L: Labels,
    dir: "ltr" | "rtl",
    companyName: string,
    arabic: boolean,
    customer: boolean
  ) => {
    const secTagline = arabic ? company.taglineAr || company.tagline : company.tagline;
    const secAddressLines = addrLines(
      arabic ? company.addressAr || company.address : company.address
    );
    return (
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
            </div>
            {/* Tagline sits under the name block and above the contact lines. */}
            {secTagline ? (
              <p className="mt-1.5 text-[9px] tracking-[0.2em] text-[#333] uppercase">
                {secTagline}
              </p>
            ) : null}
            <div className="mt-1.5 space-y-0.5 text-[10.5px] leading-snug">
              {company.phone
                ? (() => {
                    // Multiple stations, one line each — phone and email are
                    // each "·"-separated in Settings and paired positionally
                    // (station 1's phone with station 1's email, etc.). A
                    // phone with no matching email index just prints alone.
                    const phones = company.phone.split("·").map((p) => p.trim());
                    const emails = (company.email ?? "").split("·").map((e) => e.trim());
                    return phones.map((p, i) => (
                      <p key={i} className="mono" dir="ltr">
                        {p}
                        {emails[i] ? ` | ${emails[i]}` : ""}
                      </p>
                    ));
                  })()
                : null}
            </div>
          </div>
          <div className="shrink-0 text-end">
            <h1 className="text-[34px] leading-none font-bold tracking-tight uppercase">
              {title(L)}
            </h1>
            <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug">
              {secAddressLines.map((l, i) => (
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
              {customer ? null : (
                <>
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
                </>
              )}
              <th className={`${th} w-28 text-end`}>{L.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td className={`${td} mono`}>{idx + 1}</td>
                <td className={td}>{l.description || "—"}</td>
                <td className={`${td} mono text-center`}>{l.qty}</td>
                {customer ? null : (
                  <>
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
                  </>
                )}
                <td className={`${td} mono text-end font-semibold`}>
                  {money(customer ? (custLineAmounts[idx] ?? 0) : lineAmount(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals stack, bottom-trailing per the sample ── */}
        <div className="mt-6 flex justify-end">
          <table className="text-[13px]">
            <tbody>
              {customer ? null : (
                <>
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
                </>
              )}
              <tr>
                <td className="pt-1 pe-6 text-end text-[14px] font-bold">
                  {L.totalAmount} {cur} :
                </td>
                <td className="mono pt-1 text-end text-[14px] font-bold">
                  {money(totals.grandTotal)}
                </td>
              </tr>
              {/* Customer copy: VAT figure is hidden, so state that the total is
                  VAT-inclusive (keeps it a valid simplified receipt). */}
              {customer && vatRegistered && totals.vatAmount > 0 ? (
                <tr>
                  <td colSpan={2} className="pt-1 text-end text-[10.5px] text-[#444]">
                    {L.inclusiveVat} ({ratePct}%)
                  </td>
                </tr>
              ) : null}
              {/* FTA: a foreign-currency invoice must state the rate and the AED
                equivalent of the tax + total. AED remains the record of truth. */}
              {foreign ? (
                <>
                  <tr>
                    <td className="pt-2 pe-6 text-end text-[10.5px] text-[#444]">
                      {L.exchangeRate}
                    </td>
                    <td className="mono pt-2 text-end text-[10.5px] text-[#444]" dir="ltr">
                      {rateStr}
                    </td>
                  </tr>
                  {!customer && vatRegistered && totals.vatAmount > 0 ? (
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
              {/* Arrears — only on a partial or unpaid issued invoice. */}
              {showArrears ? (
                <>
                  {paidFils > 0 ? (
                    <tr>
                      <td className="pt-2 pe-6 text-end font-bold">{L.amountPaid}</td>
                      <td className="mono pt-2 text-end">{money(paidFils)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="pe-6 text-end text-[14px] font-bold">{L.balanceDue}</td>
                    <td className="mono text-end text-[14px] font-bold">
                      {money(outstandingFils)}
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
  };

  return (
    <div>
      {/* Copy + language toggles — both control preview AND print, since they
          change what's actually in the DOM below. Copy defaults to the
          customer copy (printed at point of sale); language to English. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Segmented
          aria-label="Invoice copy type"
          value={copy}
          onChange={setCopy}
          options={[
            { value: "customer", label: "Customer copy" },
            { value: "fta", label: "FTA copy" },
          ]}
        />
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
          ? Section(EN, "ltr", company.name, false, copy === "customer")
          : Section(AR, "rtl", company.nameAr || company.name, true, copy === "customer")}
      </div>
    </div>
  );
}
