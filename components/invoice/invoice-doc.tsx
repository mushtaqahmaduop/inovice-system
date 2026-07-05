import { formatAed } from "@/lib/money";

// The invoice document — REPLICATES THE CLIENT'S OWN SAMPLE LAYOUT exactly
// (DECISIONS.md Q-02 update 2026-07-05, supersedes the earlier Stamped Paper
// doc): logo block top-left with contact lines under it, big INVOICE title
// top-right with the address beneath, "Billed to" vs number/date/Paid lines,
// a single ruled grid (Item # / Description / Qty / Unit Price / Service Fee
// / [extras] / Amount), the totals stacked bottom-right, Terms & Conditions
// at the foot. Black-on-white in BOTH themes so screen matches print.
//
// Rules that still bind inside this layout: sealed values are rendered
// verbatim (never recomputed); "Tax Invoice" title + TRN appear ONLY when
// the sealed snapshot says VAT-registered; JetBrains Mono for numerals.
// The logo block renders the company name until the real logo file arrives.

export type DocCompany = {
  name: string;
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
  /** kept for call-site compatibility; the sample layout has no issued-by block */
  issuedByName?: string | null;
  issuedAt?: string | null;
}) {
  const title = vatRegistered ? "Tax Invoice" : "Invoice";
  const lineAmount = (l: DocLine) =>
    l.qty * (l.govtFee + l.serviceFee + l.extraFees.reduce((s, v) => s + v, 0));
  const paidLabel =
    status !== "issued" || !paymentStatus
      ? ""
      : paymentStatus === "paid"
        ? "Paid"
        : paymentStatus === "partial"
          ? "Partially Paid"
          : "Not Paid";
  const addressLines = (company.address ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const th = "border border-[#333] px-2 py-1.5 text-left text-[12px] font-semibold";
  const td = "border border-[#333] px-2 py-1.5 text-[12px]";

  return (
    <div className="print-doc relative border border-hairline bg-white p-8 text-[#111] print:border-0 print:p-0">
      {status === "voided" ? (
        <div className="mb-4 border-2 border-[#c2410c] px-3 py-2">
          <p className="mono text-[11px] font-semibold tracking-[0.14em] text-[#c2410c] uppercase">
            Voided{voidReason ? ` — ${voidReason}` : ""}
          </p>
        </div>
      ) : null}

      {/* ── Header: logo block left, INVOICE title + address right ── */}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {/* Logo placeholder — swaps for the real logo file when provided */}
          <div className="inline-block bg-[#1a1a1a] px-5 py-3">
            <p className="text-[16px] leading-tight font-semibold text-white">{company.name}</p>
            {company.tagline ? (
              <p className="mt-0.5 text-[8px] tracking-[0.22em] text-white/80 uppercase">
                {company.tagline}
              </p>
            ) : null}
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10.5px] leading-snug">
            {company.phone
              ? company.phone.split("·").map((p, i) => (
                  <p key={i} className="mono">
                    {p.trim()}
                    {i === 0 && company.email ? ` | ${company.email}` : ""}
                  </p>
                ))
              : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-[34px] leading-none font-bold tracking-tight uppercase">{title}</h1>
          <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug">
            {addressLines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          {vatRegistered && company.trn ? (
            <p className="mono mt-1 text-[11px]">TRN {company.trn}</p>
          ) : null}
        </div>
      </div>

      {/* ── Billed to (left) · number/date/paid (right) ── */}
      <div className="mt-12 mb-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[14px] font-bold">Billed to</p>
          <p className="text-[13px]">{billTo.name}</p>
          <p className="text-[10.5px] text-[#444]">
            Address: {billTo.address ?? ""}
            {billTo.phone ? ` · ${billTo.phone}` : ""}
          </p>
          {billTo.trn ? <p className="mono text-[10.5px] text-[#444]">TRN {billTo.trn}</p> : null}
        </div>
        <table className="shrink-0 text-[13px]">
          <tbody>
            <tr>
              <td className="pr-4 text-right font-bold">Invoice number:</td>
              <td className="mono text-right">{number ?? "— at issue —"}</td>
            </tr>
            <tr>
              <td className="pr-4 text-right font-bold">Invoice date:</td>
              <td className="mono text-right">{fmtDate(issueDate)}</td>
            </tr>
            <tr>
              <td className="pr-4 text-right font-bold">Paid / Not Paid :</td>
              <td className="text-right">{paidLabel}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── The ruled grid, exactly per the sample ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} w-12`}>Item #</th>
            <th className={th}>Description</th>
            <th className={`${th} w-14 text-center`}>Qty</th>
            <th className={`${th} w-24 text-right`}>Unit Price</th>
            <th className={`${th} w-24 text-right`}>
              Service Fee{vatRegistered ? ` (+${ratePct}% VAT)` : ""}
            </th>
            {columns.map((c, i) => (
              <th key={i} className={`${th} w-24 text-right`}>
                {c.label}
                {c.vatable && vatRegistered ? ` (+${ratePct}%)` : ""}
              </th>
            ))}
            <th className={`${th} w-28 text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={idx}>
              <td className={`${td} mono`}>{idx + 1}</td>
              <td className={td}>{l.description || "—"}</td>
              <td className={`${td} mono text-center`}>{l.qty}</td>
              <td className={`${td} mono text-right`}>
                {l.govtFee > 0 ? formatAed(l.qty * l.govtFee) : ""}
              </td>
              <td className={`${td} mono text-right`}>
                {l.serviceFee > 0 ? formatAed(l.qty * l.serviceFee) : ""}
              </td>
              {columns.map((_, i) => (
                <td key={i} className={`${td} mono text-right`}>
                  {(l.extraFees[i] ?? 0) > 0 ? formatAed(l.qty * (l.extraFees[i] ?? 0)) : ""}
                </td>
              ))}
              <td className={`${td} mono text-right font-semibold`}>
                {formatAed(lineAmount(l))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals stack, bottom-right per the sample ── */}
      <div className="mt-6 flex justify-end">
        <table className="text-[13px]">
          <tbody>
            <tr>
              <td className="pr-6 text-right font-bold">Subtotal:</td>
              <td className="mono w-28 text-right">{formatAed(totals.subtotalGovt)}</td>
            </tr>
            <tr>
              <td className="pr-6 text-right font-bold">Service Fee:</td>
              <td className="mono text-right">{formatAed(totals.subtotalService)}</td>
            </tr>
            {totals.subtotalExtras > 0 ? (
              <tr>
                <td className="pr-6 text-right font-bold">Other Charges:</td>
                <td className="mono text-right">{formatAed(totals.subtotalExtras)}</td>
              </tr>
            ) : null}
            {vatRegistered && totals.vatAmount > 0 ? (
              <tr>
                <td className="pr-6 text-right font-bold">VAT ({ratePct}%):</td>
                <td className="mono text-right">{formatAed(totals.vatAmount)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="pt-1 pr-6 text-right text-[14px] font-bold">Total Amount AED :</td>
              <td className="mono pt-1 text-right text-[14px] font-bold">
                {formatAed(totals.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Terms & Conditions foot per the sample ── */}
      <div className="mt-14">
        {/* (the sample image says "Consditions" — that's the template's typo, not copied) */}
        <p className="text-[14px] font-bold">Terms &amp; Conditions</p>
        {terms ? <p className="mt-1 text-[12.5px]">{terms}</p> : null}
        {notes ? <p className="mt-1 text-[12.5px]">{notes}</p> : null}
        <p className="mt-3 text-[12.5px]">Thank you for Your Business</p>
        {company.bankDetails ? (
          <p className="mono mt-2 text-[10.5px] text-[#444]">{company.bankDetails}</p>
        ) : null}
      </div>
    </div>
  );
}
