"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aedToFils, formatAed } from "@/lib/money";
import {
  calcInvoiceTotals,
  toRoman,
  type DraftLine,
  type ExtraColumn,
} from "@/lib/invoice-calc";

// Invoice line grid + live totals (task 4.1a). Two fixed fee columns
// (govt 0% / service VATable, D-10) plus dynamic extra columns with a
// VAT-ability flag (junction model, D-24). All cell state is AED strings;
// fils conversion happens per keystroke through lib/money.ts and the
// totals mirror issue_invoice() exactly — but remain DISPLAY-ONLY.
// Draft persistence is task 4.1b; issuing is task 4.2.

type CellKey = "govt" | "service" | string; // string = extra column id

type EditorLine = {
  key: number;
  description: string;
  qty: string;
  fees: Record<CellKey, string>;
};

let nextKey = 1;
const newLine = (): EditorLine => ({ key: nextKey++, description: "", qty: "1", fees: {} });

function cellFils(line: EditorLine, col: CellKey): number {
  return aedToFils(line.fees[col] || "0") ?? 0;
}
function cellInvalid(line: EditorLine, col: CellKey): boolean {
  const raw = line.fees[col];
  return raw !== undefined && raw.trim() !== "" && aedToFils(raw) === null;
}

export function InvoiceEditor({
  vatRegistered,
  vatRateBp,
}: {
  vatRegistered: boolean;
  vatRateBp: number;
}) {
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [columns, setColumns] = useState<ExtraColumn[]>([]);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColVatable, setNewColVatable] = useState(false);

  const ratePct = (vatRateBp / 100).toString();

  const totals = useMemo(() => {
    const draftLines: DraftLine[] = lines.map((l) => ({
      description: l.description,
      qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
      govtFee: cellFils(l, "govt"),
      serviceFee: cellFils(l, "service"),
      extraFees: Object.fromEntries(columns.map((c) => [c.id, cellFils(l, c.id)])),
    }));
    return calcInvoiceTotals(draftLines, columns, { vatRegistered, vatRateBp });
  }, [lines, columns, vatRegistered, vatRateBp]);

  function setCell(key: number, col: CellKey, value: string) {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, fees: { ...l.fees, [col]: value } } : l))
    );
  }
  function setLine(key: number, patch: Partial<EditorLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addColumn() {
    const label = newColLabel.trim();
    if (!label) return;
    setColumns((cs) => [
      ...cs,
      { id: `col-${Date.now()}-${cs.length}`, label, vatable: newColVatable },
    ]);
    setNewColLabel("");
    setNewColVatable(false);
  }
  function removeColumn(id: string) {
    setColumns((cs) => cs.filter((c) => c.id !== id));
    setLines((ls) =>
      ls.map((l) => {
        const fees = { ...l.fees };
        delete fees[id];
        return { ...l, fees };
      })
    );
  }

  const lineTotal = (l: EditorLine) => {
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1));
    const unit =
      cellFils(l, "govt") + cellFils(l, "service") + columns.reduce((s, c) => s + cellFils(l, c.id), 0);
    return qty * unit;
  };

  const feeCell = (l: EditorLine, col: CellKey, label: string) => (
    <td key={col} className="px-1.5 py-1">
      <Input
        value={l.fees[col] ?? ""}
        onChange={(e) => setCell(l.key, col, e.target.value)}
        placeholder="0.00"
        inputMode="decimal"
        aria-label={`${label} for line ${l.key}`}
        className={`mono h-7 w-24 text-right text-[12px] ${cellInvalid(l, col) ? "border-destructive" : ""}`}
      />
    </td>
  );

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            New invoice · draft
          </p>
          <p className="text-[12px] text-ink-3">
            {vatRegistered
              ? `VAT applied per column · ${ratePct}%`
              : "VAT-deregistered — no VAT will be applied"}
            {" · number allocated only at issue"}
          </p>
        </div>
      </div>

      {/* Fee-column manager (D-24) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mono text-[9px] tracking-[0.16em] text-ink-3 uppercase">Fee columns</span>
        <span className="mono border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-2">
          Govt fee <span className="text-[9px] text-ink-3">0% VAT</span>
        </span>
        <span className="mono border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-2">
          Service fee{" "}
          <span className="text-[9px] text-ink-3">{vatRegistered ? `${ratePct}% VAT` : "0% VAT"}</span>
        </span>
        {columns.map((c) => (
          <span
            key={c.id}
            className="mono flex items-center gap-1 border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-2"
          >
            {c.label}{" "}
            <span className="text-[9px] text-ink-3">
              {c.vatable && vatRegistered ? `${ratePct}% VAT` : "0% VAT"}
            </span>
            <button
              type="button"
              onClick={() => removeColumn(c.id)}
              aria-label={`Remove column ${c.label}`}
              className="ml-1 text-ink-3 hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <Input
            value={newColLabel}
            onChange={(e) => setNewColLabel(e.target.value)}
            placeholder="Courier, Stamp…"
            className="h-7 w-32 text-[12px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addColumn();
              }
            }}
          />
          <label className="flex items-center gap-1 text-[11px] text-ink-3">
            <input
              type="checkbox"
              checked={newColVatable}
              onChange={(e) => setNewColVatable(e.target.checked)}
            />
            VAT
          </label>
          <Button variant="outline" size="sm" onClick={addColumn} disabled={!newColLabel.trim()}>
            + Column
          </Button>
        </span>
      </div>

      {/* Line grid */}
      <div className="overflow-x-auto border border-hairline bg-surface">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              <th className="mono w-10 px-2 py-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                №
              </th>
              <th className="mono px-2 py-2 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                Description
              </th>
              <th className="mono w-16 px-1.5 py-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                Qty
              </th>
              <th className="mono w-28 px-1.5 py-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                Govt fee
              </th>
              <th className="mono w-28 px-1.5 py-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                Service fee
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="mono w-28 px-1.5 py-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase"
                >
                  {c.label}
                </th>
              ))}
              <th className="mono w-28 px-2 py-2 text-right text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                Line total
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.key} className="border-b border-hairline last:border-b-0">
                <td className="mono px-2 py-1 text-[11px] text-ink-3">{toRoman(idx + 1)}</td>
                <td className="px-1.5 py-1">
                  <Input
                    value={l.description}
                    onChange={(e) => setLine(l.key, { description: e.target.value })}
                    placeholder="Service description…"
                    aria-label={`Description for line ${idx + 1}`}
                    className="h-7 min-w-44 text-[12.5px]"
                  />
                </td>
                <td className="px-1.5 py-1">
                  <Input
                    value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    inputMode="numeric"
                    aria-label={`Quantity for line ${idx + 1}`}
                    className="mono h-7 w-14 text-right text-[12px]"
                  />
                </td>
                {feeCell(l, "govt", "Govt fee")}
                {feeCell(l, "service", "Service fee")}
                {columns.map((c) => feeCell(l, c.id, c.label))}
                <td className="mono px-2 py-1 text-right text-[12.5px] text-ink">
                  {formatAed(lineTotal(l))}
                </td>
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${idx + 1}`}
                    className="text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
          + Add line
        </Button>
      </div>

      {/* Totals — mirrors issue_invoice(); display-only */}
      <div className="mt-5 ml-auto max-w-sm border border-hairline bg-surface p-4">
        {totals.subtotalGovt > 0 ? (
          <TotalsRow label="Government fees (passthrough)" fils={totals.subtotalGovt} />
        ) : null}
        {totals.subtotalService > 0 ? (
          <TotalsRow
            label={`Service fees${vatRegistered ? " (taxable)" : ""}`}
            fils={totals.subtotalService}
          />
        ) : null}
        {totals.extrasVatable > 0 ? (
          <TotalsRow label="Other charges (taxable)" fils={totals.extrasVatable} />
        ) : null}
        {totals.extrasNonVatable > 0 ? (
          <TotalsRow label="Other charges (non-taxable)" fils={totals.extrasNonVatable} />
        ) : null}
        {vatRegistered && totals.vatAmount > 0 ? (
          <TotalsRow label={`VAT (${ratePct}%) on taxable fees`} fils={totals.vatAmount} />
        ) : null}
        <div className="mt-2 flex items-baseline justify-between border-t border-hairline-strong pt-2">
          <span className="text-[12px] font-medium text-ink">Net total</span>
          <span className="mono text-[16px] font-medium text-ink">
            AED {formatAed(totals.grandTotal)}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-4">
          Display only — totals are recomputed and sealed server-side at issue.
        </p>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled title="Draft save arrives with task 4.1b">
          Save as draft · 4.1b
        </Button>
        <Button size="sm" disabled title="Issue flow arrives with task 4.2">
          Issue invoice · 4.2
        </Button>
      </div>
    </div>
  );
}

function TotalsRow({ label, fils }: { label: string; fils: number }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[12px] text-ink-2">{label}</span>
      <span className="mono text-[12.5px] text-ink">AED {formatAed(fils)}</span>
    </div>
  );
}
