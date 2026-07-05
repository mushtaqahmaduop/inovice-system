import { formatAed } from "@/lib/money";
import { toRoman } from "@/lib/invoice-calc";

// The invoice document (task 4.2) — one presentational component for the
// mandatory pre-issue preview (client state) AND the sealed detail view
// (DB values). It renders exactly what it is given: for sealed invoices the
// totals are the SEALED columns, never recomputed (CLAUDE.md §3.3). This is
// also the minimal readable A4 print surface ([#23a]); pixel-honest print
// lands with 6.1.

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
  govtFee: number; // unit fils
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
  issuedByName,
  issuedAt,
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
  issuedByName?: string | null;
  issuedAt?: string | null;
  voidReason?: string | null;
}) {
  const title = vatRegistered ? "Tax Invoice" : "Invoice";
  const lineTotal = (l: DocLine) =>
    l.qty * (l.govtFee + l.serviceFee + l.extraFees.reduce((s, v) => s + v, 0));

  return (
    <div className="print-doc relative border border-hairline bg-surface p-6 text-ink print:border-0 print:p-0">
      {status === "voided" ? (
        <div className="mb-4 border border-warning bg-warning-soft px-3 py-2 print:mb-6">
          <p className="mono text-[10px] tracking-[0.14em] text-warning uppercase">
            Voided{voidReason ? ` — ${voidReason}` : ""}
          </p>
        </div>
      ) : null}

      {/* Head */}
      <div className="flex items-start justify-between gap-6 border-b border-hairline-strong pb-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-medium tracking-tight">{company.name}</h2>
          {company.tagline ? <p className="text-[11px] text-ink-2">{company.tagline}</p> : null}
          {company.address ? <p className="text-[11px] text-ink-3">{company.address}</p> : null}
          <p className="text-[11px] text-ink-3">
            {[company.phone, company.email].filter(Boolean).join(" · ")}
          </p>
          {vatRegistered && company.trn ? (
            <p className="mono mt-1 text-[11px] text-ink-2">TRN {company.trn}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="mono mb-1 inline-block border border-ink px-2 py-0.5 text-[9px] tracking-[0.16em] uppercase">
            {title}
          </p>
          <p className="mono text-[15px] font-medium">
            {number ?? "— allocated at issue —"}
          </p>
          <p className="mono text-[11px] text-ink-3">{issueDate ?? "date set at issue"}</p>
          {status !== "draft" ? (
            <p className="mono mt-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              {status === "issued" ? "· Sealed ·" : "· Voided ·"}
            </p>
          ) : null}
        </div>
      </div>

      {/* Bill to */}
      <div className="flex justify-between gap-6 border-b border-hairline py-3">
        <div className="min-w-0">
          <p className="mono mb-1 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Bill to</p>
          <p className="text-[13px] font-medium">{billTo.name}</p>
          {billTo.address ? <p className="text-[11px] text-ink-3">{billTo.address}</p> : null}
          {billTo.phone ? <p className="mono text-[11px] text-ink-3">{billTo.phone}</p> : null}
          {billTo.trn ? <p className="mono text-[11px] text-ink-2">TRN {billTo.trn}</p> : null}
        </div>
        {issuedByName ? (
          <div className="mono shrink-0 text-right text-[9px] leading-relaxed tracking-[0.08em] text-ink-3 uppercase">
            Issued by
            <br />
            {issuedByName}
            <br />
            {issuedAt ? new Date(issuedAt).toISOString().slice(0, 10) : null}
          </div>
        ) : null}
      </div>

      {/* Lines */}
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline-strong">
            <th className="mono w-8 py-1.5 pr-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase">№</th>
            <th className="mono py-1.5 pr-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              Description
            </th>
            <th className="mono w-10 py-1.5 pr-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              Qty
            </th>
            <th className="mono w-24 py-1.5 pr-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              Govt fee
            </th>
            <th className="mono w-24 py-1.5 pr-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              Service fee{vatRegistered ? ` (+${ratePct}%)` : ""}
            </th>
            {columns.map((c, i) => (
              <th
                key={i}
                className="mono w-24 py-1.5 pr-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase"
              >
                {c.label}
                {c.vatable && vatRegistered ? ` (+${ratePct}%)` : ""}
              </th>
            ))}
            <th className="mono w-24 py-1.5 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => (
            <tr key={idx} className="border-b border-hairline">
              <td className="mono py-1.5 pr-2 text-[10px] text-ink-3">{toRoman(idx + 1)}</td>
              <td className="py-1.5 pr-2 text-[12px]">{l.description || "—"}</td>
              <td className="mono py-1.5 pr-2 text-right text-[11.5px]">{l.qty}</td>
              <td className="mono py-1.5 pr-2 text-right text-[11.5px]">
                {l.govtFee > 0 ? formatAed(l.qty * l.govtFee) : "—"}
              </td>
              <td className="mono py-1.5 pr-2 text-right text-[11.5px]">
                {l.serviceFee > 0 ? formatAed(l.qty * l.serviceFee) : "—"}
              </td>
              {columns.map((_, i) => (
                <td key={i} className="mono py-1.5 pr-2 text-right text-[11.5px]">
                  {(l.extraFees[i] ?? 0) > 0 ? formatAed(l.qty * (l.extraFees[i] ?? 0)) : "—"}
                </td>
              ))}
              <td className="mono py-1.5 text-right text-[11.5px]">{formatAed(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64">
          {totals.subtotalGovt > 0 ? (
            <Row label="Government fees (passthrough)" v={totals.subtotalGovt} />
          ) : null}
          {totals.subtotalService > 0 ? (
            <Row label={`Service fees${vatRegistered ? " (taxable)" : ""}`} v={totals.subtotalService} />
          ) : null}
          {totals.subtotalExtras > 0 ? <Row label="Other charges" v={totals.subtotalExtras} /> : null}
          {totals.vatAmount > 0 ? <Row label={`VAT (${ratePct}%)`} v={totals.vatAmount} /> : null}
          <div className="mt-1 flex items-baseline justify-between border-t border-hairline-strong pt-1.5">
            <span className="text-[12px] font-medium">Total</span>
            <span className="mono text-[15px] font-medium">AED {formatAed(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes / terms / bank */}
      {notes || terms || company.bankDetails ? (
        <div className="mt-5 space-y-2 border-t border-hairline pt-3">
          {notes ? (
            <p className="text-[11px] leading-relaxed text-ink-2">
              <span className="mono mr-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">Notes</span>
              {notes}
            </p>
          ) : null}
          {terms ? (
            <p className="text-[11px] leading-relaxed text-ink-2">
              <span className="mono mr-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">Terms</span>
              {terms}
            </p>
          ) : null}
          {company.bankDetails ? (
            <p className="mono text-[10px] text-ink-3">{company.bankDetails}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[11px] text-ink-2">{label}</span>
      <span className="mono text-[11.5px]">AED {formatAed(v)}</span>
    </div>
  );
}
