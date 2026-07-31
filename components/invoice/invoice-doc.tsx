"use client";

import { useState } from "react";
import Image from "next/image";
import { formatAed } from "@/lib/money";
import { calcCustomerLineAmounts, customerLineNet } from "@/lib/invoice-calc";
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
  /** Third-party delivery attributed to THIS row (D-30a, per line since 0017),
   *  AED fils. DELIBERATE exception to the unit-fee convention above: this is
   *  the ROW TOTAL and is never multiplied by qty — a driver's fee is flat for
   *  the trip. Outside the sealed totals, so only the customer copy adds it.
   *  Omitted (undefined) on pre-0017 invoices, which carried delivery only at
   *  invoice level; see `custLineAmounts` for that fallback. */
  deliveryFee?: number;
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
  paidTotal = 0,
  voidReason,
  displayCurrency = "AED",
  exchangeRateE6 = null,
  deliveryFee = 0,
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
  /** Accepted for call-site compatibility but no longer read: since D-30 the
   *  two copies settle against different totals, so each derives its own
   *  paid/partial/unpaid word from paidTotal (see payFigures). For the customer
   *  copy that is identical to invoice_list.payment_status. */
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
  /** Third-party delivery collected for the customer (D-30), AED fils. Sits
   *  OUTSIDE the sealed totals: the CUSTOMER copy blends it into the line
   *  amounts and its grand total, the FTA copy never shows or mentions it. */
  deliveryFee?: number;
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
  const lineAmount = (l: DocLine) => customerLineNet(l);
  // What the customer actually hands over: the sealed supply plus the driver's
  // fee we collected on their behalf (D-30). grand_total stays the centre's
  // supply, and is the only figure the FTA copy is ever shown.
  const customerTotal = totals.grandTotal + Math.max(0, deliveryFee);
  // Customer-copy per-line amounts — see calcCustomerLineAmounts for the rules
  // (sealed VAT distributed across lines, per-line delivery charged as entered,
  // residual absorbed so the printed lines foot to the printed total).
  const custLineAmounts: number[] = calcCustomerLineAmounts(lines, columns, {
    vatRegistered,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    deliveryFee,
  });
  // Arrears: on a partial or unpaid issued invoice, spell out what was paid and
  // what remains. AED fils in, rendered in the display currency.
  //
  // The two copies settle against different totals (D-30). The customer copy
  // uses everything received against what they owe. The FTA copy must never
  // hint at delivery, so it credits payment to the SUPPLY only — capped at
  // grand_total — and derives its own paid/partial/unpaid word from that.
  // Without the cap, a fully-paid 450 invoice would print "Amount Paid 450"
  // under a total of 400 on the FTA copy: a phantom overpayment that both
  // looks broken and leaks the delivery charge.
  const paidAll = status === "issued" ? paidTotal : 0;
  const payFigures = (customer: boolean) => {
    const total = customer ? customerTotal : totals.grandTotal;
    const paid = customer ? paidAll : Math.min(paidAll, totals.grandTotal);
    const key: PayKey | null =
      status !== "issued" ? null : paid >= total ? "paid" : paid === 0 ? "unpaid" : "partial";
    return {
      total,
      paid,
      outstanding: total - paid,
      key,
      showArrears: key === "partial" || key === "unpaid",
    };
  };
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
    // Copy-specific money: the customer copy totals what they owe (supply +
    // delivery), the FTA copy totals the supply alone (D-30).
    const pay = payFigures(customer);
    const displayTotal = customer ? customerTotal : totals.grandTotal;
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
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            {/* Owner request 2026-07-30: the real mark prints BEFORE the company
                name. It is a black-on-white JPEG, so it sits in its own bordered
                white square rather than inside the dark name block, which would
                have shown as a white patch. Loaded eagerly on purpose — a lazy
                image can still be unloaded when the print dialog snapshots the
                page, and .print-doc already sets print-color-adjust: exact so it
                is not stripped as a "background". */}
            <div className="flex items-center gap-3">
              <Image
                src="/brand/pl-monogram.jpg"
                alt=""
                width={112}
                height={112}
                priority
                className="size-14 shrink-0 border border-[#ddd] bg-white object-contain p-0.5"
              />
              <div className="inline-block bg-[#1a1a1a] px-5 py-3">
                <p className="text-[16px] leading-tight font-semibold text-white">{companyName}</p>
              </div>
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
          {/* min-w-0 (not shrink-0): at the preview sheet's width the fixed
              right column could not give way, so the address ran into the
              INVOICE title. It may now shrink and wrap; the title itself stays
              on one line. */}
          <div className="min-w-0 text-end">
            <h1 className="text-[30px] leading-none font-bold tracking-tight whitespace-nowrap uppercase">
              {title(L)}
            </h1>
            <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug break-words">
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
                <td className="text-end">{pay.key ? L.paid[pay.key] : ""}</td>
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
                <td className="mono pt-1 text-end text-[14px] font-bold">{money(displayTotal)}</td>
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
                      {formatAed(displayTotal)}
                    </td>
                  </tr>
                </>
              ) : null}
              {/* Arrears — only on a partial or unpaid issued invoice. */}
              {pay.showArrears ? (
                <>
                  {pay.paid > 0 ? (
                    <tr>
                      <td className="pt-2 pe-6 text-end font-bold">{L.amountPaid}</td>
                      <td className="mono pt-2 text-end">{money(pay.paid)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="pe-6 text-end text-[14px] font-bold">{L.balanceDue}</td>
                    <td className="mono text-end text-[14px] font-bold">
                      {money(pay.outstanding)}
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
