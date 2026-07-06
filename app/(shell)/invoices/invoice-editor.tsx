"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InvoiceDoc, type DocCompany } from "@/components/invoice/invoice-doc";
import { aedToFils, formatAed } from "@/lib/money";
import { calcInvoiceTotals, toRoman, type DraftLine, type ExtraColumn } from "@/lib/invoice-calc";

// Invoice draft editor (tasks 4.1a + 4.1b): line grid with two fixed fee
// columns (D-10) + dynamic extra columns (D-24), live totals mirroring
// issue_invoice() (display-only), customer picker with walk-in
// quick-create ([#7]), catalogue picker (3.3), notes/terms with Settings
// defaults, draft save/resume through /api/invoices. Issuing is task 4.2.
// Q-04 (extra-column presets) unanswered — columns stay manual-add only.

export type PickerCustomer = {
  id: string;
  name: string;
  type: "regular" | "walk_in";
  trn: string | null;
  phone: string | null;
  address: string | null;
};
export type PickerService = {
  id: string;
  name: string;
  unit: string;
  govt_fee: number;
  service_fee: number;
};
export type ExistingDraft = {
  id: string;
  customerId: string;
  issueDate: string | null;
  notes: string | null;
  terms: string | null;
  columns: { label: string; vatable: boolean }[];
  lines: {
    description: string;
    qty: number;
    govtFee: number;
    serviceFee: number;
    extraFees: Record<string, number>; // keyed by column INDEX as string
  }[];
};

type CellKey = "govt" | "service" | string;
type EditorLine = { key: number; description: string; qty: string; fees: Record<CellKey, string> };

let nextKey = 1;
const blankLine = (): EditorLine => ({ key: nextKey++, description: "", qty: "1", fees: {} });
const filsToInput = (fils: number) => (fils === 0 ? "" : formatAed(fils).replace(/,/g, ""));

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
  customers,
  services,
  defaultNotes,
  defaultTerms,
  existing,
  company,
}: {
  vatRegistered: boolean;
  vatRateBp: number;
  customers: PickerCustomer[];
  services: PickerService[];
  defaultNotes: string;
  defaultTerms: string;
  existing: ExistingDraft | null;
  company: DocCompany;
}) {
  const router = useRouter();

  const [columns, setColumns] = useState<ExtraColumn[]>(() =>
    (existing?.columns ?? []).map((c, i) => ({
      id: `col-${i}`,
      label: c.label,
      vatable: c.vatable,
    }))
  );
  const [lines, setLines] = useState<EditorLine[]>(() =>
    existing
      ? existing.lines.map((l) => ({
          key: nextKey++,
          description: l.description,
          qty: String(l.qty),
          fees: {
            govt: filsToInput(l.govtFee),
            service: filsToInput(l.serviceFee),
            ...Object.fromEntries(
              Object.entries(l.extraFees).map(([idx, v]) => [`col-${idx}`, filsToInput(v)])
            ),
          },
        }))
      : [blankLine()]
  );
  const [customer, setCustomer] = useState<PickerCustomer | null>(
    existing ? (customers.find((c) => c.id === existing.customerId) ?? null) : null
  );
  const [notes, setNotes] = useState(existing ? (existing.notes ?? "") : defaultNotes);
  const [terms, setTerms] = useState(existing ? (existing.terms ?? "") : defaultTerms);
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? "");

  const [custQuery, setCustQuery] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [walkInMode, setWalkInMode] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcQuery, setSvcQuery] = useState("");
  const [newColLabel, setNewColLabel] = useState("");
  const [newColVatable, setNewColVatable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Issue flow (task 4.2): once the first save-on-issue creates the draft,
  // draftId keeps later saves/issues pointed at the same row.
  const [draftId, setDraftId] = useState<string | null>(existing?.id ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirming, setConfirming] = useState(false); // one-way until error (R-6/[#23b])
  const [issueError, setIssueError] = useState<string | null>(null);

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

  const custMatches = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, custQuery]);

  const svcMatches = useMemo(() => {
    const q = svcQuery.trim().toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }, [services, svcQuery]);

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
  function addFromCatalogue(s: PickerService) {
    setLines((ls) => [
      ...ls.filter(
        (l) => l.description.trim() !== "" || Object.values(l.fees).some((v) => v?.trim())
      ),
      {
        key: nextKey++,
        description: s.name,
        qty: "1",
        fees: { govt: filsToInput(s.govt_fee), service: filsToInput(s.service_fee) },
      },
    ]);
    setSvcOpen(false);
    setSvcQuery("");
  }

  async function quickCreateWalkIn() {
    if (!walkInName.trim()) return;
    setError(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "walk_in",
        name: walkInName.trim(),
        phone: walkInPhone || null,
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not create walk-in");
      return;
    }
    const { id } = await res.json();
    setCustomer({
      id,
      name: walkInName.trim(),
      type: "walk_in",
      trn: null,
      phone: walkInPhone || null,
      address: null,
    });
    setWalkInMode(false);
    setWalkInName("");
    setWalkInPhone("");
    router.refresh(); // picker list picks up the new row
  }

  function payload() {
    return {
      customerId: customer!.id,
      issueDate: issueDate || null,
      notes,
      terms,
      columns: columns.map((c) => ({ label: c.label, vatable: c.vatable })),
      lines: lines.map((l) => ({
        description: l.description.trim(),
        qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
        govtFee: cellFils(l, "govt"),
        serviceFee: cellFils(l, "service"),
        extraFees: Object.fromEntries(
          columns
            .map((c, idx) => [String(idx), cellFils(l, c.id)] as const)
            .filter(([, v]) => v > 0)
        ),
      })),
    };
  }

  function validateForSave(): string | null {
    if (!customer) return "Pick a customer first — every invoice has one.";
    const invalid = lines.some((l) =>
      (["govt", "service", ...columns.map((c) => c.id)] as CellKey[]).some((c) => cellInvalid(l, c))
    );
    if (invalid) return "Fix the highlighted amounts (AED, max 2 decimals).";
    return null;
  }

  // Persist the current state (create once, then update). Returns the
  // draft id or null after surfacing the error.
  async function persistDraft(): Promise<string | null> {
    const res = draftId
      ? await fetch(`/api/invoices/${draftId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_draft", data: payload() }),
        })
      : await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Save failed");
      return null;
    }
    if (draftId) return draftId;
    const { id } = await res.json();
    setDraftId(id);
    return id;
  }

  async function saveDraft() {
    setError(null);
    const problem = validateForSave();
    if (problem) return setError(problem);
    setSaving(true);
    const wasNew = !draftId;
    const id = await persistDraft();
    setSaving(false);
    if (!id) return;
    if (wasNew) {
      router.push(`/invoices/${id}/edit?saved=1`);
    } else {
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    }
  }

  // Issue = save the exact current state, then the MANDATORY preview
  // (D-23); sealing only happens from the sheet's Confirm button.
  async function startIssue() {
    setError(null);
    setIssueError(null);
    const problem = validateForSave();
    if (problem) return setError(problem);
    const meaningful = lines.some((l) => l.description.trim() !== "" || lineTotal(l) > 0);
    if (!meaningful) return setError("Add at least one line with a description or amount.");
    setSaving(true);
    const id = await persistDraft();
    setSaving(false);
    if (!id) return;
    setConfirming(false);
    setPreviewOpen(true);
  }

  async function confirmIssue() {
    if (confirming || !draftId) return; // [#23b] — no double-fire
    setConfirming(true);
    setIssueError(null);
    const res = await fetch(`/api/invoices/${draftId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue" }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      // R-6: alreadyIssued is SUCCESS — show the issued invoice either way.
      router.push(`/invoices/${draftId}`);
      return; // stay disabled while navigating
    }
    setIssueError(body?.error ?? "Issue failed — the draft is unchanged.");
    setConfirming(false);
  }

  const lineTotal = (l: EditorLine) => {
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1));
    return (
      qty *
      (cellFils(l, "govt") +
        cellFils(l, "service") +
        columns.reduce((s, c) => s + cellFils(l, c.id), 0))
    );
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
            {existing ? "Draft invoice · resume" : "New invoice · draft"}
          </p>
          <p className="text-[12px] text-ink-3">
            {vatRegistered
              ? `VAT applied per column · ${ratePct}%`
              : "VAT-deregistered — no VAT will be applied"}
            {" · number allocated only at issue"}
          </p>
        </div>
        {savedAt ? <span className="text-[11px] text-success">Saved {savedAt}</span> : null}
      </div>

      {/* Bill to */}
      <div className="mb-5 border border-hairline bg-surface p-4">
        <p className="mono mb-3 text-[9px] tracking-[0.16em] text-ink-3 uppercase">Bill to</p>
        {customer ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-medium text-ink">{customer.name}</p>
              <p className="text-[11px] text-ink-3">
                <span className="mono uppercase">
                  {customer.type === "walk_in" ? "walk-in" : "regular"}
                </span>
                {customer.trn ? (
                  <>
                    {" · TRN "}
                    <span className="mono">{customer.trn}</span>
                  </>
                ) : null}
                {customer.phone ? (
                  <>
                    {" · "}
                    <span className="mono">{customer.phone}</span>
                  </>
                ) : null}
              </p>
              {customer.address ? (
                <p className="text-[11px] text-ink-3">{customer.address}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>
              Change
            </Button>
          </div>
        ) : walkInMode ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-ink-3" htmlFor="wi-name">
                Walk-in name *
              </label>
              <Input
                id="wi-name"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className="h-8 w-52 text-[13px]"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-ink-3" htmlFor="wi-phone">
                Phone
              </label>
              <Input
                id="wi-phone"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                className="h-8 w-40 text-[13px]"
              />
            </div>
            <Button size="sm" onClick={quickCreateWalkIn} disabled={!walkInName.trim()}>
              Create & use
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWalkInMode(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Input
                value={custQuery}
                onChange={(e) => {
                  setCustQuery(e.target.value);
                  setCustOpen(true);
                }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                placeholder="Type to search customers…"
                className="h-8 w-72 text-[13px]"
              />
              {custOpen && custMatches.length > 0 ? (
                <div className="absolute top-9 left-0 z-30 w-72 border border-hairline-strong bg-surface shadow-lg">
                  {custMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomer(c);
                        setCustQuery("");
                        setCustOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                        {c.type === "walk_in" ? "walk-in" : "regular"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => setWalkInMode(true)}>
              + New walk-in
            </Button>
          </div>
        )}
      </div>

      {/* Fee-column manager (D-24) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mono text-[9px] tracking-[0.16em] text-ink-3 uppercase">Fee columns</span>
        <span className="mono border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-2">
          Govt fee <span className="text-[9px] text-ink-3">0% VAT</span>
        </span>
        <span className="mono border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-2">
          Service fee{" "}
          <span className="text-[9px] text-ink-3">
            {vatRegistered ? `${ratePct}% VAT` : "0% VAT"}
          </span>
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
      <div className="relative mt-2 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          + Add line
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSvcOpen((v) => !v)}>
          From service catalogue
        </Button>
        {svcOpen ? (
          <div className="absolute top-9 left-24 z-30 w-80 border border-hairline-strong bg-surface shadow-lg">
            <input
              value={svcQuery}
              onChange={(e) => setSvcQuery(e.target.value)}
              placeholder="Search catalogue…"
              className="h-9 w-full border-b border-hairline bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-ink-3"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto">
              {svcMatches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addFromCatalogue(s)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink hover:bg-accent"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="mono text-[10px] text-ink-3">
                    {formatAed(s.govt_fee)} + {formatAed(s.service_fee)} / {s.unit}
                  </span>
                </button>
              ))}
              {svcMatches.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-ink-3">No catalogue matches.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Meta + totals */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-64 flex-1 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="inv-date">
              Invoice date (defaults to today at issue)
            </label>
            <Input
              id="inv-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mono h-8 w-44 text-[12px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="inv-notes">
              Notes (printed)
            </label>
            <textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-hairline-strong bg-transparent p-2 text-[12.5px] text-ink outline-none focus:border-ink-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-3" htmlFor="inv-terms">
              Payment terms (printed)
            </label>
            <textarea
              id="inv-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={2}
              className="w-full rounded border border-hairline-strong bg-transparent p-2 text-[12.5px] text-ink outline-none focus:border-ink-3"
            />
          </div>
        </div>

        <div className="w-full max-w-sm border border-hairline bg-surface p-4">
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
      </div>

      {error ? <p className="mt-3 text-right text-[11px] text-warning">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving}>
          {saving ? "Saving…" : draftId ? "Save draft" : "Save as draft"}
        </Button>
        <Button size="sm" onClick={startIssue} disabled={saving}>
          Issue invoice…
        </Button>
      </div>

      {/* Mandatory pre-issue preview (D-23): slide-over, ~48% width,
          Esc/outside-click closes. Sealing happens ONLY from here. */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:w-[48%] sm:max-w-[48%]">
          <SheetTitle className="mono mb-3 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
            Preview · confirm to seal
          </SheetTitle>
          <InvoiceDoc
            company={company}
            vatRegistered={vatRegistered}
            ratePct={ratePct}
            number={null}
            status="draft"
            issueDate={issueDate || null}
            billTo={{
              name: customer?.name ?? "—",
              trn: customer?.trn,
              phone: customer?.phone,
              address: customer?.address,
            }}
            columns={columns.map((c) => ({ label: c.label, vatable: c.vatable }))}
            lines={lines.map((l) => ({
              description: l.description,
              qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
              govtFee: cellFils(l, "govt"),
              serviceFee: cellFils(l, "service"),
              extraFees: columns.map((c) => cellFils(l, c.id)),
            }))}
            totals={{
              subtotalGovt: totals.subtotalGovt,
              subtotalService: totals.subtotalService,
              subtotalExtras: totals.subtotalExtras,
              vatAmount: totals.vatAmount,
              grandTotal: totals.grandTotal,
            }}
            notes={notes || null}
            terms={terms || null}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            Issuing allocates the next invoice number and seals this document permanently — totals
            are recomputed server-side at that moment. Corrections afterwards happen via a new
            document, never by editing.
          </p>
          {issueError ? <p className="mt-2 text-[11px] text-warning">{issueError}</p> : null}
          <div className="mt-4 flex justify-end gap-2 pb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(false)}
              disabled={confirming}
            >
              Back to editing
            </Button>
            <Button size="sm" onClick={confirmIssue} disabled={confirming}>
              {confirming ? "Issuing…" : "Confirm & Issue"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
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
