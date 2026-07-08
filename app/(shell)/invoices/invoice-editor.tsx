"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InvoiceDoc, type DocCompany } from "@/components/invoice/invoice-doc";
import { aedToFils, formatAed } from "@/lib/money";
import { calcInvoiceTotals, type DraftLine, type ExtraColumn } from "@/lib/invoice-calc";

// Invoice draft editor (tasks 4.1a + 4.1b), rebuilt for the Warm Paper /
// Federal Blue system (redesign slice 6). Document-shaped form per
// PREMIUM_EXECUTION_GUIDE §4: quiet line grid (borders appear on
// hover/focus), Tab past the last cell adds a row (§2.6), drafts autosave
// silently every 20s once they exist, live totals mirror issue_invoice()
// display-only. Issuing (4.2) stays behind the mandatory preview sheet.
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

// Quiet grid cell — reads as a document until you interact with it.
const cellInputClass =
  "h-8 rounded-[6px] border-transparent bg-transparent text-[13px] shadow-none hover:border-border-strong dark:bg-transparent";

const captionClass =
  "text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase";

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

  // §2.6 — Tab past the last fee cell of the last row adds a new row and
  // moves focus to its description.
  const [pendingFocusKey, setPendingFocusKey] = useState<number | null>(null);
  const descRefs = useRef(new Map<number, HTMLInputElement>());
  useEffect(() => {
    if (pendingFocusKey === null) return;
    descRefs.current.get(pendingFocusKey)?.focus();
    setPendingFocusKey(null);
  }, [pendingFocusKey]);

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
  function addLine(focus = false) {
    const nl = blankLine();
    setLines((ls) => [...ls, nl]);
    if (focus) setPendingFocusKey(nl.key);
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
  // draft id or null; surfaces the error unless silent (autosave).
  async function persistDraft(silent = false): Promise<string | null> {
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
      if (!silent) setError((await res.json().catch(() => null))?.error ?? "Save failed");
      return null;
    }
    if (draftId) return draftId;
    const { id } = await res.json();
    setDraftId(id);
    return id;
  }

  const savedStamp = () =>
    "Saved · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  async function saveDraft() {
    setError(null);
    const problem = validateForSave();
    if (problem) return setError(problem);
    setSaving(true);
    const wasNew = !draftId;
    const id = await persistDraft();
    setSaving(false);
    if (!id) return;
    lastSavedRef.current = JSON.stringify(payload());
    if (wasNew) {
      router.push(`/invoices/${id}/edit?saved=1`);
    } else {
      setSavedAt(savedStamp());
      router.refresh();
    }
  }

  // §4 — silent autosave every 20s once the draft exists. Never creates a
  // row on its own, never interrupts the preview/issue flow, never shows
  // errors (the next manual save will).
  const lastSavedRef = useRef<string | null>(existing ? null : "__new__");
  const autosaveRef = useRef<() => void>(() => {});
  autosaveRef.current = () => {
    if (!draftId || saving || previewOpen || confirming) return;
    if (validateForSave()) return;
    const snapshot = JSON.stringify(payload());
    if (snapshot === lastSavedRef.current) return;
    void persistDraft(true).then((id) => {
      if (!id) return;
      lastSavedRef.current = snapshot;
      setSavedAt(savedStamp());
    });
  };
  useEffect(() => {
    const t = setInterval(() => autosaveRef.current(), 20_000);
    return () => clearInterval(t);
  }, []);

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
    lastSavedRef.current = JSON.stringify(payload());
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

  const lastFeeCol: CellKey = columns.length > 0 ? columns[columns.length - 1].id : "service";

  const feeCell = (l: EditorLine, col: CellKey, label: string, isLastLine: boolean) => (
    <td key={col} className="px-1 py-1">
      <Input
        value={l.fees[col] ?? ""}
        onChange={(e) => setCell(l.key, col, e.target.value)}
        placeholder="0.00"
        inputMode="decimal"
        aria-label={`${label} for line ${l.key}`}
        aria-invalid={cellInvalid(l, col) || undefined}
        onKeyDown={
          isLastLine && col === lastFeeCol
            ? (e) => {
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  addLine(true);
                }
              }
            : undefined
        }
        className={`mono w-24 text-right ${cellInputClass}`}
      />
    </td>
  );

  return (
    <div>
      {/* Header — the screen's one serif display element (§3.2). */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="serif text-[26px] leading-8 font-semibold text-foreground">
            {existing ? "Draft invoice" : "New invoice"}
          </h1>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            {vatRegistered
              ? `VAT ${ratePct}% applies per fee column.`
              : "VAT-deregistered — no VAT will be applied."}{" "}
            The invoice number is allocated only at issue.
          </p>
        </div>
        {savedAt ? <span className="mono text-[13px] text-text-tertiary">{savedAt}</span> : null}
      </div>

      {/* Bill to */}
      <section className="mb-6 rounded-[12px] border border-border bg-surface p-5">
        <p className={`mb-3 ${captionClass}`}>Bill to</p>
        {customer ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] leading-[23px] font-[550] text-foreground">
                {customer.name}
              </p>
              <p className="mt-0.5 text-[13px] leading-[19px] text-text-secondary">
                {customer.type === "walk_in" ? "Walk-in" : "Regular"}
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
                <p className="text-[13px] leading-[19px] text-text-secondary">{customer.address}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>
              Change
            </Button>
          </div>
        ) : walkInMode ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <FieldLabel htmlFor="wi-name">Walk-in name</FieldLabel>
              <Input
                id="wi-name"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className="w-56"
                autoFocus
              />
            </div>
            <div>
              <FieldLabel htmlFor="wi-phone">Phone</FieldLabel>
              <Input
                id="wi-phone"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                className="w-44"
              />
            </div>
            <Button size="sm" onClick={quickCreateWalkIn} disabled={!walkInName.trim()}>
              Create and use
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWalkInMode(false)}>
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
                placeholder="Search customers…"
                aria-label="Search customers"
                className="w-80"
                autoFocus={!existing}
              />
              {custOpen && custMatches.length > 0 ? (
                <div className="absolute top-11 left-0 z-30 w-80 overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-[var(--shadow-popover)]">
                  {custMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomer(c);
                        setCustQuery("");
                        setCustOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-[12px] text-text-tertiary">
                        {c.type === "walk_in" ? "Walk-in" : "Regular"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => setWalkInMode(true)}>
              New walk-in
            </Button>
          </div>
        )}
      </section>

      {/* Fee-column manager (D-24) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={captionClass}>Fee columns</span>
        <FeeColumnChip label="Govt fee" vat="0% VAT" />
        <FeeColumnChip label="Service fee" vat={vatRegistered ? `${ratePct}% VAT` : "0% VAT"} />
        {columns.map((c) => (
          <FeeColumnChip
            key={c.id}
            label={c.label}
            vat={c.vatable && vatRegistered ? `${ratePct}% VAT` : "0% VAT"}
            onRemove={() => removeColumn(c.id)}
          />
        ))}
        <span className="flex items-center gap-2">
          <Input
            value={newColLabel}
            onChange={(e) => setNewColLabel(e.target.value)}
            placeholder="Courier, stamp…"
            aria-label="New fee column label"
            className="h-8 w-36 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addColumn();
              }
            }}
          />
          <label className="flex items-center gap-1.5 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={newColVatable}
              onChange={(e) => setNewColVatable(e.target.checked)}
              className="size-3.5 accent-[var(--accent)]"
            />
            VAT
          </label>
          <Button variant="outline" size="sm" onClick={addColumn} disabled={!newColLabel.trim()}>
            Add column
          </Button>
        </span>
      </div>

      {/* Line grid — quiet cells, §2.7 deliberate column widths */}
      <div className="overflow-x-auto rounded-[12px] border border-border bg-surface">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-strong">
              <th className={`w-10 px-3 py-2.5 ${captionClass}`}>#</th>
              <th className={`px-2 py-2.5 ${captionClass}`}>Description</th>
              <th className={`w-14 px-2 py-2.5 text-right ${captionClass}`}>Qty</th>
              <th className={`w-28 px-2 py-2.5 text-right ${captionClass}`}>Govt fee</th>
              <th className={`w-28 px-2 py-2.5 text-right ${captionClass}`}>Service fee</th>
              {columns.map((c) => (
                <th key={c.id} className={`w-28 px-2 py-2.5 text-right ${captionClass}`}>
                  {c.label}
                </th>
              ))}
              <th className={`w-28 px-3 py-2.5 text-right ${captionClass}`}>Line total</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const isLastLine = idx === lines.length - 1;
              return (
                <tr key={l.key} className="border-b border-border last:border-b-0">
                  <td className="mono px-3 py-1 text-[13px] text-text-tertiary">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <Input
                      ref={(el) => {
                        if (el) descRefs.current.set(l.key, el);
                        else descRefs.current.delete(l.key);
                      }}
                      value={l.description}
                      onChange={(e) => setLine(l.key, { description: e.target.value })}
                      placeholder="Service description…"
                      aria-label={`Description for line ${idx + 1}`}
                      className={`min-w-44 ${cellInputClass}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      inputMode="numeric"
                      aria-label={`Quantity for line ${idx + 1}`}
                      className={`mono w-14 text-right ${cellInputClass}`}
                    />
                  </td>
                  {feeCell(l, "govt", "Govt fee", isLastLine)}
                  {feeCell(l, "service", "Service fee", isLastLine)}
                  {columns.map((c) => feeCell(l, c.id, c.label, isLastLine))}
                  <td className="mono px-3 py-1 text-right text-[13px] font-medium text-foreground">
                    {formatAed(lineTotal(l))}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${idx + 1}`}
                      title="Remove line"
                      className="text-text-tertiary hover:text-foreground"
                    >
                      <X />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="relative mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => addLine()}>
          Add line
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSvcOpen((v) => !v)}>
          From service catalogue
        </Button>
        {svcOpen ? (
          <div className="absolute top-10 left-24 z-30 w-80 overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-[var(--shadow-popover)]">
            <input
              value={svcQuery}
              onChange={(e) => setSvcQuery(e.target.value)}
              placeholder="Search catalogue…"
              className="h-10 w-full border-b border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-text-tertiary"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto">
              {svcMatches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addFromCatalogue(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="mono text-[12px] text-text-tertiary">
                    {formatAed(s.govt_fee)} + {formatAed(s.service_fee)} / {s.unit}
                  </span>
                </button>
              ))}
              {svcMatches.length === 0 ? (
                <p className="px-3 py-3 text-[13px] text-text-secondary">No catalogue matches.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Meta + totals */}
      <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-64 flex-1 space-y-4">
          <div>
            <FieldLabel htmlFor="inv-date">Invoice date</FieldLabel>
            <Input
              id="inv-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mono w-48 text-[13px]"
            />
            <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
              Defaults to today at issue.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="inv-notes">Notes (printed)</FieldLabel>
            <textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[8px] border border-border-strong bg-surface p-3 text-[13px] leading-[19px] text-foreground transition-colors outline-none placeholder:text-text-tertiary focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
            />
          </div>
          <div>
            <FieldLabel htmlFor="inv-terms">Payment terms (printed)</FieldLabel>
            <textarea
              id="inv-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={2}
              className="w-full rounded-[8px] border border-border-strong bg-surface p-3 text-[13px] leading-[19px] text-foreground transition-colors outline-none placeholder:text-text-tertiary focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
            />
          </div>
        </div>

        <div className="w-full max-w-sm rounded-[12px] border border-border bg-surface p-5">
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
          <div className="mt-3 flex items-baseline justify-between border-t border-border-strong pt-3">
            <span className="text-[15px] font-[550] text-foreground">Net total</span>
            <span className="mono text-[22px] leading-7 font-semibold text-foreground">
              <span className="mr-1.5 text-[13px] font-normal text-text-tertiary">AED</span>
              {formatAed(totals.grandTotal)}
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-4 text-text-tertiary">
            Display only — totals are recomputed and sealed server-side at issue.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-right text-[13px] leading-[19px] text-error">{error}</p>
      ) : null}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={saveDraft} disabled={saving}>
          {saving ? "Saving…" : "Save draft"}
        </Button>
        {/* The screen's only blue button. */}
        <Button onClick={startIssue} disabled={saving}>
          Issue invoice
        </Button>
      </div>

      {/* Mandatory pre-issue preview (D-23): slide-over, ~48% width,
          Esc/outside-click closes. Sealing happens ONLY from here. */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:w-[48%] sm:max-w-[48%]">
          <SheetTitle className={`mb-4 ${captionClass}`}>Preview — confirm to issue</SheetTitle>
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
          <p className="mt-4 text-[13px] leading-[19px] text-text-secondary">
            Issuing allocates the next invoice number and this invoice becomes permanent — it cannot
            be edited afterwards. Totals are recomputed server-side at that moment; corrections
            happen via a new document.
          </p>
          {issueError ? (
            <p className="mt-2 text-[13px] leading-[19px] text-error">{issueError}</p>
          ) : null}
          <div className="mt-5 flex justify-end gap-3 pb-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={confirming}>
              Keep editing
            </Button>
            <Button onClick={confirmIssue} disabled={confirming}>
              {confirming ? "Issuing…" : "Confirm and issue"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FeeColumnChip({
  label,
  vat,
  onRemove,
}: {
  label: string;
  vat: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-3 py-1 text-[13px] leading-[19px] text-foreground">
      {label}
      <span className="mono text-[11px] text-text-tertiary">{vat}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove column ${label}`}
          title={`Remove column ${label}`}
          className="-mr-1 rounded-full p-0.5 text-text-tertiary transition-colors hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

function TotalsRow({ label, fils }: { label: string; fils: number }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-[13px] leading-[19px] text-text-secondary">{label}</span>
      <span className="mono text-[15px] text-foreground">
        <span className="mr-1 text-[12px] text-text-tertiary">AED</span>
        {formatAed(fils)}
      </span>
    </div>
  );
}
