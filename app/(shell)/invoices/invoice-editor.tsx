"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  X,
  Info,
  BookOpen,
  Minus,
  Plus,
  Trash2,
  Save,
  Clock,
  Columns3,
  ArrowLeft,
  Eye,
  Zap,
  CalendarClock,
  UserCog,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { FieldLabel, FieldHint } from "@/components/ui/field";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { InvoiceDoc, type DocCompany } from "@/components/invoice/invoice-doc";
import { useDeleteDraft } from "@/components/invoice/use-delete-draft";
import { aedToFils, formatAed } from "@/lib/money";
import { todayInDubai } from "@/lib/date";
import {
  SUPPORTED_CURRENCIES,
  isForeignCurrency,
  parseRateToE6,
  formatForeign,
  formatRateFromE6,
} from "@/lib/currency";
import {
  calcInvoiceTotals,
  calcLineVat,
  type DraftLine,
  type ExtraColumn,
} from "@/lib/invoice-calc";

// Invoice draft editor (tasks 4.1a + 4.1b), rebuilt for the Cool White /
// Federal Blue system (redesign slice 6 → owner-mockup pass). Numbered
// step cards (Bill to → Items → Details / Summary → Payment) per the owner's
// own New-Invoice mockup, but every behaviour is unchanged: quiet line grid
// (borders appear on hover/focus), Tab past the last cell adds a row
// (§2.6), drafts autosave silently every 20s once they exist, live totals
// mirror issue_invoice() display-only, and issuing (4.2) stays behind the
// mandatory preview sheet. Q-04 (extra-column presets) unanswered —
// columns stay manual-add only.

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
export type PayMethod = { id: string; label: string };
// Recently-used line items (owner "Get from recent") — sourced from recent
// invoice_lines, deduped by description. No service_id link exists, so
// "recent services" means the lines actually put on recent invoices.
export type RecentLine = { description: string; govtFee: number; serviceFee: number };
export type ExistingDraft = {
  id: string;
  customerId: string;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  terms: string | null;
  displayCurrency: string | null;
  exchangeRateE6: number | null;
  columns: { label: string; vatable: boolean }[];
  lines: {
    description: string;
    qty: number;
    govtFee: number;
    serviceFee: number;
    /** D-30 delivery for this row (a row total, never per-unit) */
    deliveryFee: number;
    extraFees: Record<string, number>; // keyed by column INDEX as string
  }[];
};

// "delivery" is a first-class cell alongside govt/service, not an extra column:
// it is excluded from the sealed totals and never printed on the FTA copy (D-30),
// which no user-defined extra column can express.
type CellKey = "govt" | "service" | "delivery" | string;
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

// Grid cell. The owner's 2026-07-30 redesign brief was blunt — "no border, no
// professionality" — so the quiet borderless cell is gone: every editable cell
// now reads as a real field, which is also what the mockup draws.
const cellInputClass = "h-9 rounded-[8px] border-border-strong bg-surface text-[13px]";

const captionClass =
  "text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase";

export function InvoiceEditor({
  vatRegistered,
  vatRateBp,
  customers,
  services,
  methods,
  recent = [],
  defaultNotes,
  defaultTerms,
  existing,
  canDelete = false,
  company,
}: {
  vatRegistered: boolean;
  vatRateBp: number;
  customers: PickerCustomer[];
  services: PickerService[];
  methods: PayMethod[];
  recent?: RecentLine[];
  defaultNotes: string;
  defaultTerms: string;
  existing: ExistingDraft | null;
  /** D-31: offer "Delete draft" — admin, or the employee who created it. */
  canDelete?: boolean;
  company: DocCompany;
}) {
  const router = useRouter();
  const deleteDraft = useDeleteDraft();

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
            delivery: filsToInput(l.deliveryFee),
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
  // Foreign-currency DISPLAY layer (D-27). AED stays the sealed record of truth;
  // a foreign currency + manually-entered rate only change how the document
  // renders. Drafts may carry a currency with a blank rate mid-edit; the issue
  // path refuses to seal a foreign invoice without a positive rate.
  const [displayCurrency, setDisplayCurrency] = useState(existing?.displayCurrency ?? "AED");
  const [rateInput, setRateInput] = useState(
    existing?.exchangeRateE6 ? formatRateFromE6(existing.exchangeRateE6) : ""
  );
  const isForeign = isForeignCurrency(displayCurrency);
  const rateE6 = isForeign ? parseRateToE6(rateInput) : null;
  const rateInvalid = isForeign && rateInput.trim() !== "" && rateE6 === null;
  // Prefill today's date so the picker shows a concrete day (existing drafts
  // keep their saved date; a blank one still falls back to today). The user
  // can change it; the server re-defaults to the issue day only if cleared.
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? todayInDubai());
  // When the money is due. Blank by default — Q-11 (the house convention) is
  // still unanswered, so nothing is assumed on the operator's behalf. Once set,
  // it drives the EXISTING overdue predicate: an issued, not-fully-paid invoice
  // past this date shows the burnt-orange Overdue chip and counts in the sidebar.
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  // §2.6 — smooth row add/remove in the line-item grid (auto-animate).
  const [linesRef] = useAutoAnimate<HTMLTableSectionElement>();

  // Step ⑤ Payment (client request 2026-07-30). A draft carries no payments —
  // the API refuses them outright ("Drafts carry no payments — issue the invoice
  // first") because payment status is derived from SUM(payments) against a total
  // that does not exist yet. So this is an INTENT captured before issuing:
  // confirmIssue seals the invoice and then posts the payment.
  //
  // "now" is the default (the counter case: the customer is standing there).
  // "later" collapses the fields and seals the invoice unpaid — a first-class
  // outcome, not the absence of one; the sealed invoice's Payments panel takes
  // the money whenever it arrives, in as many part payments as needed.
  // With no payment method configured there is nothing to record against, so
  // "later" is the only honest default.
  const [payWhen, setPayWhen] = useState<"now" | "later">(methods.length > 0 ? "now" : "later");
  const [payAmount, setPayAmount] = useState("");
  const [payMethodId, setPayMethodId] = useState(methods[0]?.id ?? "");
  const [payReceivedOn, setPayReceivedOn] = useState(todayInDubai);
  const [payReference, setPayReference] = useState("");
  // Deliberately NOT prefilled (owner 2026-07-30): the field starts empty and
  // shows the total as a placeholder only, so the amount is always something an
  // employee typed on purpose rather than a number the form put there. Issuing
  // with it blank is refused, never silently treated as "the full amount".

  const [custQuery, setCustQuery] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [walkInMode, setWalkInMode] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcQuery, setSvcQuery] = useState("");
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentQuery, setRecentQuery] = useState("");
  const [colsOpen, setColsOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColVatable, setNewColVatable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Issue flow (task 4.2): once the first save-on-issue creates the draft,
  // draftId keeps later saves/issues pointed at the same row.
  const [draftId, setDraftId] = useState<string | null>(existing?.id ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // "issue" = the MANDATORY pre-seal preview (D-23), the only route to Confirm.
  // "look" = the header's Preview Invoice button: the same document, read-only,
  // nothing saved and no way to seal from it.
  const [previewMode, setPreviewMode] = useState<"issue" | "look">("issue");
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

  // BUG FIX (owner 2026-07-30): the Columns / catalogue / recent popovers only
  // closed by clicking their own trigger again — a click anywhere else left them
  // hanging over the grid. They are plain conditional divs, not a popover
  // primitive, so dismissal has to be wired by hand.
  //
  // pointerdown in the CAPTURE phase, and triggers are skipped by marker
  // attribute: otherwise this would close the popover on pointerdown and the
  // trigger's own onClick would immediately reopen it.
  useEffect(() => {
    if (!svcOpen && !recentOpen && !colsOpen) return;
    const closeAll = () => {
      setSvcOpen(false);
      setRecentOpen(false);
      setColsOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[data-editor-popover], [data-editor-popover-trigger]")) return;
      closeAll();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [svcOpen, recentOpen, colsOpen]);

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

  // Delivery collected for a third-party driver (D-30), now a COLUMN in the grid
  // (client request 2026-07-30). The invoice's figure is simply the sum of the
  // cells — NOT multiplied by qty, unlike every other fee cell: a driver's fee is
  // flat for the trip. It never enters calcInvoiceTotals (nor issue_invoice()),
  // so totals.grandTotal stays the centre's supply and the only figure the FTA
  // copy prints, while the customer copy, payments panel and ledger all work
  // from grand_total + delivery.
  const deliveryFils = useMemo(
    () => lines.reduce((s, l) => s + cellFils(l, "delivery"), 0),
    [lines]
  );
  // What the customer hands over = the sealed supply + the driver's fee (D-30).
  const customerTotal = totals.grandTotal + deliveryFils;

  // Payment intent, derived. `payFils` is what will be posted the moment the
  // invoice is sealed; anything left over stays outstanding on the ledger.
  const payFils = payWhen === "now" ? aedToFils(payAmount) : null;
  const payInvalid = payWhen === "now" && payAmount.trim() !== "" && payFils === null;
  const payExceeds = payFils !== null && payFils > customerTotal && customerTotal > 0;
  const payRemaining = payFils !== null ? customerTotal - payFils : customerTotal;

  const custMatches = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, custQuery]);

  const svcMatches = useMemo(() => {
    const q = svcQuery.trim().toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }, [services, svcQuery]);

  const recentMatches = useMemo(() => {
    const q = recentQuery.trim().toLowerCase();
    const base = q ? recent.filter((r) => r.description.toLowerCase().includes(q)) : recent;
    return base.slice(0, 10);
  }, [recent, recentQuery]);

  function setCell(key: number, col: CellKey, value: string) {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, fees: { ...l.fees, [col]: value } } : l))
    );
  }
  function setLine(key: number, patch: Partial<EditorLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function bumpQty(l: EditorLine, delta: number) {
    setLine(l.key, { qty: String(Math.max(1, (Math.floor(Number(l.qty)) || 1) + delta)) });
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
  function addFromRecent(r: RecentLine) {
    setLines((ls) => [
      ...ls.filter(
        (l) => l.description.trim() !== "" || Object.values(l.fees).some((v) => v?.trim())
      ),
      {
        key: nextKey++,
        description: r.description,
        qty: "1",
        fees: { govt: filsToInput(r.govtFee), service: filsToInput(r.serviceFee) },
      },
    ]);
    setRecentOpen(false);
    setRecentQuery("");
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
    // customer?.id (not customer!.id): payload() is also called at render time
    // to seed the beforeunload baseline, and on a fresh /invoices/new no
    // customer is picked yet — the non-null assertion crashed the whole page.
    // The save/issue paths validate a customer first, so it's the real id there.
    return {
      customerId: customer?.id ?? null,
      issueDate: issueDate || null,
      dueDate: dueDate || null,
      notes,
      terms,
      displayCurrency,
      // AED carries no rate; a foreign draft may still be rate-less mid-edit.
      exchangeRateE6: displayCurrency === "AED" ? null : rateE6,
      columns: columns.map((c) => ({ label: c.label, vatable: c.vatable })),
      lines: lines.map((l) => ({
        description: l.description.trim(),
        qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
        govtFee: cellFils(l, "govt"),
        serviceFee: cellFils(l, "service"),
        // Row total, not a unit fee — the server sums these into
        // invoices.delivery_fee and never trusts a client-side total.
        deliveryFee: cellFils(l, "delivery"),
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
      (["govt", "service", "delivery", ...columns.map((c) => c.id)] as CellKey[]).some((c) =>
        cellInvalid(l, c)
      )
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
    toast.success("Draft saved");
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

  // beforeunload guard for the data-loss window. A brand-new invoice is never
  // autosaved (§4 — autosave never CREATES a row), so typed-but-unsaved work
  // is lost on a hard navigation (tab close, reload, external link). Warn if
  // the current state differs from what's been persisted — the pristine
  // baseline for a never-saved draft, the last saved snapshot otherwise. This
  // only fires on real browser unloads, not Next client-side navigations, so
  // the save/issue flows (which router.push) are unaffected.
  const baselineRef = useRef<string | null>(null);
  if (baselineRef.current === null) baselineRef.current = JSON.stringify(payload());
  const dirtyRef = useRef<() => boolean>(() => false);
  dirtyRef.current = () => {
    if (confirming) return false; // sealing in progress — let it complete
    const persisted =
      lastSavedRef.current === "__new__" ? baselineRef.current : lastSavedRef.current;
    return JSON.stringify(payload()) !== persisted;
  };
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Header "Preview Invoice" — a look at the document, nothing more. Deliberately
  // does NOT persist and cannot seal: the pre-issue preview (D-23) stays the only
  // path to Confirm & Issue, so this can never become a second way to issue.
  function openLookPreview() {
    setError(null);
    setIssueError(null);
    setPreviewMode("look");
    setPreviewOpen(true);
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
    // A foreign-currency invoice cannot be sealed without a positive rate (D-27);
    // catch it here so the owner fixes it before the preview rather than at seal.
    if (isForeign && !rateE6)
      return setError(`Enter the AED-per-${displayCurrency} exchange rate before issuing.`);
    // Step ⑤ — a "paying now" invoice must carry a usable payment, or be
    // switched to "Paying later" (which is a real choice, not a failure).
    if (payWhen === "now") {
      if (payFils === null || payFils <= 0)
        return setError("Enter the amount being paid, or choose “Paying later”.");
      if (payExceeds)
        return setError(
          `The payment is more than the customer owes (AED ${formatAed(customerTotal)}).`
        );
      if (!payMethodId) return setError("Choose a payment method to record the payment.");
    }
    setSaving(true);
    const id = await persistDraft();
    setSaving(false);
    if (!id) return;
    lastSavedRef.current = JSON.stringify(payload());
    setConfirming(false);
    setPreviewMode("issue");
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
      const issuedLabel = body?.invoiceNumber ? `Invoice ${body.invoiceNumber}` : "Invoice";
      // Record-on-issue payment: the invoice is now sealed, so the ledger will
      // accept it. This POST is a SEPARATE request from the seal — if it fails
      // (transient 5xx, a deactivated payment method, a network blip) the
      // invoice is sealed UNPAID. We must NOT report a clean success in that
      // case, or the operator prints an "issued & paid" invoice whose payment
      // was never recorded. So: await it, check res.ok, and on failure surface
      // a persistent error telling them to record it on the invoice page.
      if (payWhen === "now") {
        const fils = payFils;
        if (fils && fils > 0 && payMethodId) {
          let payOk = false;
          try {
            const payRes = await fetch(`/api/invoices/${draftId}/payments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "record",
                amount: fils,
                methodId: payMethodId,
                receivedOn: payReceivedOn,
                reference: payReference.trim() || null,
              }),
            });
            payOk = payRes.ok;
          } catch {
            payOk = false;
          }
          if (!payOk) {
            toast.error(
              `${issuedLabel} was issued, but the payment was NOT recorded — open the invoice and record it there.`,
              { duration: Infinity }
            );
            // The sealed invoice still loads; land on it so the payment can be
            // recorded immediately. Same destination as the success path now
            // that issuing never prints by itself.
            router.push(`/invoices/${draftId}`);
            return; // stay disabled while navigating
          }
        }
      }
      // Say what actually happened to the money, so an unpaid or part-paid
      // invoice is never mistaken for a settled one.
      const outstanding =
        payWhen === "now" && payFils && payFils > 0 ? customerTotal - payFils : customerTotal;
      toast.success(
        outstanding > 0
          ? `${issuedLabel} issued — AED ${formatAed(outstanding)} outstanding. Print when you're ready.`
          : `${issuedLabel} issued and paid in full — use Print when you're ready.`
      );
      // Client request 2026-07-30: issuing must NOT open the print dialog by
      // itself. Land on the sealed invoice and let the operator press Print
      // there (they may want to check it, take payment, or not print at all).
      // No `?print=1` — that flag stays for the invoices list's Print action,
      // which IS a deliberate button press.
      router.push(`/invoices/${draftId}`);
      return; // stay disabled while navigating
    }
    setIssueError(body?.error ?? "Issue failed — the draft is unchanged.");
    setConfirming(false);
  }

  // What this row costs the customer. Delivery is added FLAT (not × qty) and is
  // the one part of this figure the FTA copy never shows — the Summary spells
  // that out with its own "Invoice total on the FTA copy" line.
  const lineTotal = (l: EditorLine) => {
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1));
    return (
      qty *
        (cellFils(l, "govt") +
          cellFils(l, "service") +
          columns.reduce((s, c) => s + cellFils(l, c.id), 0)) +
      cellFils(l, "delivery")
    );
  };

  // Read-only VAT for one row, mirroring issue_invoice() exactly. Zero while the
  // centre is deregistered, which is why the cell renders an em dash rather than
  // a column of 0.00s.
  const lineVat = (l: EditorLine) =>
    calcLineVat(
      {
        description: l.description,
        qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
        govtFee: cellFils(l, "govt"),
        serviceFee: cellFils(l, "service"),
        extraFees: Object.fromEntries(columns.map((c) => [c.id, cellFils(l, c.id)])),
      },
      columns,
      { vatRegistered, vatRateBp }
    );

  const lastFeeCol: CellKey = columns.length > 0 ? columns[columns.length - 1].id : "delivery";

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
    <div className="space-y-6">
      {/* Page header (owner redesign 2026-07-30) — title + the two actions that
          are useful before the form is finished. Deliberately says "Generate",
          not "Generate and send": there is no email-out path, and a button that
          implies one would be a lie. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            aria-label="Back to invoices"
            title="Back to invoices"
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-foreground"
          >
            <ArrowLeft className="size-[18px]" />
          </button>
          <div>
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-foreground">
              {existing ? "Edit Draft" : "Create Invoice"}
            </h1>
            <p className="mt-0.5 text-[13px] leading-[19px] text-text-secondary">
              Generate professional invoices for your clients
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openLookPreview}>
            <Eye /> Preview Invoice
          </Button>
          <Button size="sm" onClick={saveDraft} loading={saving}>
            <Save /> {saving ? "Saving…" : "Save as Draft"}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-[12px] border border-accent-border bg-accent-soft px-4 py-3">
        <Info className="mt-0.5 size-[18px] shrink-0 text-primary" />
        <p className="text-[13px] leading-5 text-foreground">
          {vatRegistered
            ? `VAT ${ratePct}% applies per fee column.`
            : "VAT — deregistered: no VAT will be applied."}{" "}
          The invoice number is allocated only at issue and cannot be edited.
        </p>
      </div>

      {/* ① Bill to */}
      <StepCard n={1} title="Bill To">
        {customer ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-accent-border bg-accent-soft text-[14px] font-semibold text-primary"
              >
                {initials(customer.name)}
              </span>
              <div className="min-w-0">
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
                  <p className="text-[13px] leading-[19px] text-text-secondary">
                    {customer.address}
                  </p>
                ) : null}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>
              <UserCog /> Change Client
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
            <div className="relative flex-1">
              <Input
                value={custQuery}
                onChange={(e) => {
                  setCustQuery(e.target.value);
                  setCustOpen(true);
                }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                placeholder="Type to search customers…"
                aria-label="Search customers"
                className="w-full"
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWalkInMode(true)}
              className="border-accent-border bg-accent-soft text-primary hover:bg-accent-soft hover:brightness-95"
            >
              <Plus /> New walk-in
            </Button>
          </div>
        )}
      </StepCard>

      {/* ② Invoice items */}
      <StepCard
        n={2}
        title="Invoice Items"
        actions={
          <div className="relative flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              data-editor-popover-trigger
              aria-expanded={svcOpen}
              onClick={() => {
                setSvcOpen((v) => !v);
                setRecentOpen(false);
                setColsOpen(false);
              }}
            >
              <BookOpen /> Add from Service Catalogue
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-editor-popover-trigger
              aria-expanded={recentOpen}
              onClick={() => {
                setRecentOpen((v) => !v);
                setSvcOpen(false);
                setColsOpen(false);
              }}
            >
              <Clock /> Add from Recent
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-editor-popover-trigger
              aria-expanded={colsOpen}
              onClick={() => {
                setColsOpen((v) => !v);
                setSvcOpen(false);
                setRecentOpen(false);
              }}
            >
              <Columns3 /> Columns
              {columns.length > 0 ? (
                <span className="mono ml-1 rounded-full bg-bg-sunken px-1.5 text-[11px] text-text-secondary">
                  {columns.length}
                </span>
              ) : null}
            </Button>

            {/* Get-from-recent popover — recently-used line items. */}
            {recentOpen ? (
              <div
                data-editor-popover
                className="absolute top-10 right-0 z-30 w-80 overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-[var(--shadow-popover)]"
              >
                <input
                  value={recentQuery}
                  onChange={(e) => setRecentQuery(e.target.value)}
                  placeholder="Search recent items…"
                  className="h-10 w-full border-b border-border bg-transparent px-3 text-[13px] text-foreground outline-none placeholder:text-text-tertiary"
                  autoFocus
                />
                <div className="max-h-64 overflow-y-auto">
                  {recentMatches.map((r, i) => (
                    <button
                      key={`${r.description}-${i}`}
                      type="button"
                      onClick={() => addFromRecent(r)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
                    >
                      <span className="min-w-0 flex-1 truncate">{r.description}</span>
                      <span className="mono text-[12px] text-text-tertiary">
                        {formatAed(r.govtFee)} + {formatAed(r.serviceFee)}
                      </span>
                    </button>
                  ))}
                  {recentMatches.length === 0 ? (
                    <p className="px-3 py-3 text-[13px] text-text-secondary">
                      {recent.length === 0 ? "No recent items yet." : "No matches."}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Columns popover — fee-column manager (D-24). */}
            {colsOpen ? (
              <div
                data-editor-popover
                className="absolute top-10 right-0 z-30 w-80 overflow-hidden rounded-[12px] border border-border bg-surface-raised p-3 shadow-[var(--shadow-popover)]"
              >
                <p className={`mb-2 ${captionClass}`}>Fee columns</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <FeeColumnChip label="Govt fee" vat="0% VAT" />
                  <FeeColumnChip
                    label="Service fee"
                    vat={vatRegistered ? `${ratePct}% VAT` : "0% VAT"}
                  />
                  {/* Built in, and not removable: delivery is the one column the
                      FTA copy must never show (D-30). */}
                  <FeeColumnChip label="Delivery" vat="not taxed · customer copy only" />
                  {columns.map((c) => (
                    <FeeColumnChip
                      key={c.id}
                      label={c.label}
                      vat={c.vatable && vatRegistered ? `${ratePct}% VAT` : "0% VAT"}
                      onRemove={() => removeColumn(c.id)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newColLabel}
                    onChange={(e) => setNewColLabel(e.target.value)}
                    placeholder="Courier, stamp…"
                    aria-label="New fee column label"
                    className="h-8 flex-1 text-[13px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addColumn();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addColumn}
                    disabled={!newColLabel.trim()}
                  >
                    Add
                  </Button>
                </div>
                {vatRegistered ? (
                  <label className="mt-2 flex items-center gap-1.5 text-[13px] text-text-secondary">
                    <input
                      type="checkbox"
                      checked={newColVatable}
                      onChange={(e) => setNewColVatable(e.target.checked)}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                    Apply {ratePct}% VAT to this column
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      >
        {/* Line grid — ruled header band and real bordered cells per the owner's
            2026-07-30 mockup. Column set is unchanged: the Govt/Service split is
            the centre's model (§3.3) and Delivery is D-30a. */}
        <div className="overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-bg-sunken">
                <th className={`w-10 px-3 py-3 ${captionClass}`}>#</th>
                <th className={`px-2 py-3 ${captionClass}`}>Description</th>
                <th className={`w-28 px-2 py-3 text-center ${captionClass}`}>Qty</th>
                <th className={`w-28 px-2 py-3 text-right ${captionClass}`}>Govt fee (AED)</th>
                <th className={`w-28 px-2 py-3 text-right ${captionClass}`}>Service fee (AED)</th>
                {/* Delivery sits beside the service fee (client, 2026-07-30).
                    Flat per row, not taxed, never on the FTA copy — D-30. */}
                <th
                  className={`w-28 px-2 py-3 text-right ${captionClass}`}
                  title="Driver's fee collected with this bill. Flat per row (not multiplied by quantity), never shown on the FTA copy."
                >
                  Delivery (AED)
                </th>
                {columns.map((c) => (
                  <th key={c.id} className={`w-28 px-2 py-3 text-right ${captionClass}`}>
                    {c.label} (AED)
                  </th>
                ))}
                {/* Computed, never editable: the rate is a snapshotted Settings
                    value (D-16), not a per-line operator choice. */}
                <th
                  className={`w-28 px-2 py-3 text-right ${captionClass}`}
                  title={
                    vatRegistered
                      ? `VAT at ${ratePct}%, calculated per line exactly as the seal does.`
                      : "No VAT — the centre is not VAT-registered, so every line is 0%."
                  }
                >
                  VAT amount (AED)
                </th>
                <th className={`w-28 px-3 py-3 text-right ${captionClass}`}>Line total (AED)</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody ref={linesRef}>
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
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => bumpQty(l, -1)}
                          disabled={(Math.floor(Number(l.qty)) || 1) <= 1}
                          aria-label={`Decrease quantity for line ${idx + 1}`}
                          title="Decrease quantity"
                          className="text-text-tertiary hover:text-foreground"
                        >
                          <Minus />
                        </Button>
                        <Input
                          value={l.qty}
                          onChange={(e) => setLine(l.key, { qty: e.target.value })}
                          inputMode="numeric"
                          aria-label={`Quantity for line ${idx + 1}`}
                          className={`mono w-10 text-center ${cellInputClass}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => bumpQty(l, 1)}
                          aria-label={`Increase quantity for line ${idx + 1}`}
                          title="Increase quantity"
                          className="text-text-tertiary hover:text-foreground"
                        >
                          <Plus />
                        </Button>
                      </div>
                    </td>
                    {feeCell(l, "govt", "Govt fee", isLastLine)}
                    {feeCell(l, "service", "Service fee", isLastLine)}
                    {feeCell(l, "delivery", "Delivery", isLastLine)}
                    {columns.map((c) => feeCell(l, c.id, c.label, isLastLine))}
                    <td className="mono px-2 py-1 text-right text-[13px] text-text-secondary">
                      {vatRegistered ? formatAed(lineVat(l)) : "—"}
                    </td>
                    <td className="mono px-3 py-1 text-right text-[13px] font-semibold text-foreground">
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
                        className="text-text-tertiary hover:text-danger"
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Only worth saying once the column is actually in use. */}
        {deliveryFils > 0 ? (
          <FieldHint>
            Delivery totals AED {formatAed(deliveryFils)} — charged flat per row (quantity does not
            multiply it), added to the customer&rsquo;s total and balance, and never shown on the
            FTA copy.
          </FieldHint>
        ) : null}
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => addLine()}>
            <Plus /> Add item
          </Button>
          <span className="text-[13px] text-text-tertiary">or</span>
          <Button
            variant="ghost"
            size="sm"
            data-editor-popover-trigger
            aria-expanded={svcOpen}
            onClick={() => setSvcOpen((v) => !v)}
          >
            <BookOpen /> Add from Service Catalogue
          </Button>
          {svcOpen ? (
            <div
              data-editor-popover
              className="absolute top-10 left-24 z-30 w-80 overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-[var(--shadow-popover)]"
            >
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
      </StepCard>

      {/* ③ details + ④ summary */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <StepCard n={3} title="Invoice Details" caption="Customize your invoice information">
          <div className="space-y-4">
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
                Prefilled with today — change it if the invoice is for another day.
              </p>
            </div>
            {/* Foreign-currency display layer (D-27). AED stays the record; a
                foreign currency renders the document in that currency from the
                sealed AED total, with the AED equivalent + rate also shown. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="inv-currency">Invoice currency</FieldLabel>
                <SelectNative
                  id="inv-currency"
                  value={displayCurrency}
                  onChange={(e) => setDisplayCurrency(e.target.value)}
                  className="w-48 text-[13px]"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </SelectNative>
                <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
                  Amounts are always priced and recorded in AED.
                </p>
              </div>
              {isForeign ? (
                <div>
                  <FieldLabel htmlFor="inv-rate">
                    Exchange rate (AED per 1 {displayCurrency})
                  </FieldLabel>
                  <Input
                    id="inv-rate"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 3.6725"
                    aria-invalid={rateInvalid}
                    className="mono w-48 text-right text-[13px]"
                  />
                  <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
                    {rateInvalid
                      ? "Enter a positive rate (max 6 decimals)."
                      : `Required before issuing. Use the supply-date rate.`}
                  </p>
                </div>
              ) : null}
            </div>
            {/* Delivery used to live here as one invoice-level field; since
                2026-07-30 it is the Delivery column in the items grid above. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between">
                  <FieldLabel htmlFor="inv-notes">Notes (printed)</FieldLabel>
                  <span className="mono text-[11px] text-text-tertiary">{notes.length} / 250</span>
                </div>
                <textarea
                  id="inv-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 250))}
                  maxLength={250}
                  rows={3}
                  placeholder="Add any notes…"
                  className="w-full rounded-[8px] border border-border-strong bg-surface p-3 text-[13px] leading-[19px] text-foreground transition-colors outline-none placeholder:text-text-tertiary focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <FieldLabel htmlFor="inv-terms">Payment terms (printed)</FieldLabel>
                  <span className="mono text-[11px] text-text-tertiary">{terms.length} / 250</span>
                </div>
                <textarea
                  id="inv-terms"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value.slice(0, 250))}
                  maxLength={250}
                  rows={3}
                  placeholder="e.g. Due in 7 days"
                  className="w-full rounded-[8px] border border-border-strong bg-surface p-3 text-[13px] leading-[19px] text-foreground transition-colors outline-none placeholder:text-text-tertiary focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
                />
              </div>
            </div>
          </div>
        </StepCard>

        <StepCard n={4} title="Summary">
          <div className="rounded-[12px] border border-accent-border bg-accent-soft p-5">
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
            {/* Subtotal before VAT — the mockup's first line, and a useful
                cross-check that the fee columns add up before tax. */}
            <div className="mt-1 border-t border-accent-border pt-2">
              <TotalsRow
                label="Subtotal (before VAT)"
                fils={totals.subtotalGovt + totals.subtotalService + totals.subtotalExtras}
              />
            </div>
            <TotalsRow
              label={vatRegistered ? `VAT (${ratePct}%) on taxable fees` : "VAT (not registered)"}
              fils={vatRegistered ? totals.vatAmount : 0}
            />
            {deliveryFils > 0 ? (
              <TotalsRow label="Delivery (collected for driver)" fils={deliveryFils} />
            ) : null}
            <div className="mt-3 flex items-baseline justify-between border-t border-accent-border pt-3">
              <span className="text-[15px] font-[550] text-foreground">
                {deliveryFils > 0 ? "Customer pays" : "Net total"}
              </span>
              <span className="mono text-[26px] leading-8 font-semibold text-primary">
                <span className="mr-1.5 text-[13px] font-normal text-text-tertiary">AED</span>
                {formatAed(customerTotal)}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-4 text-text-secondary">
              This is the total amount payable by the customer.
            </p>
            {deliveryFils > 0 ? (
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-[12px] leading-4 text-text-tertiary">
                  Invoice total on the FTA copy (delivery excluded)
                </span>
                <span className="mono text-[13px] font-[550] text-foreground">
                  <span className="mr-1.5 text-[11px] font-normal text-text-tertiary">AED</span>
                  {formatAed(totals.grandTotal)}
                </span>
              </div>
            ) : null}
            {isForeign && rateE6 ? (
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-[12px] leading-4 text-text-tertiary">
                  Shown on the document as ({displayCurrency})
                </span>
                <span className="mono text-[13px] font-[550] text-foreground">
                  <span className="mr-1.5 text-[11px] font-normal text-text-tertiary">
                    {displayCurrency}
                  </span>
                  {formatForeign(customerTotal, rateE6)}
                </span>
              </div>
            ) : null}
            <p className="mt-3 flex items-start gap-1.5 border-t border-accent-border pt-3 text-[12px] leading-4 text-text-tertiary">
              <Info className="mt-px size-3.5 shrink-0" />
              <span>
                {isForeign
                  ? `Recorded in AED — the ${displayCurrency} figure is derived at the rate above. The full VAT breakdown is in the preview.`
                  : "Display only — totals are recomputed and sealed server-side at issue. The full VAT breakdown is in the preview."}
              </span>
            </p>
          </div>
        </StepCard>
      </div>

      {/* ⑤ Payment — the client's "pay now or pay later" decision, made BEFORE
          issuing (client request 2026-07-30). It replaces the checkbox that used
          to sit under the Summary totals. Nothing is written until the invoice
          is sealed: a draft cannot hold payments, so this is the intent and
          confirmIssue posts it the moment the number is allocated. */}
      <StepCard n={5} title="Payment" caption="Set payment preferences and due date">
        {methods.length === 0 ? (
          <p className="text-[13px] leading-[19px] text-text-secondary">
            No payment methods are configured, so this invoice will be issued unpaid. Add one in
            Settings to take payment at the counter — you can still record the payment on the
            invoice itself at any time.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <PayChoice
                selected={payWhen === "now"}
                onSelect={() => setPayWhen("now")}
                icon={<Zap className="size-[18px]" />}
                title="Paying Now"
                detail="Record the payment as the invoice is issued"
              />
              <PayChoice
                selected={payWhen === "later"}
                onSelect={() => setPayWhen("later")}
                icon={<CalendarClock className="size-[18px]" />}
                title="Paying Later"
                detail="Issue it unpaid and collect the money afterwards"
              />
            </div>

            {payWhen === "now" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <FieldLabel htmlFor="pay-amt">Amount (AED)</FieldLabel>
                  <Input
                    id="pay-amt"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={filsToInput(customerTotal) || "0.00"}
                    aria-invalid={payInvalid || payExceeds || undefined}
                    className="mono w-full text-right text-[13px]"
                  />
                  <FieldHint>
                    {customerTotal > 0
                      ? `Full amount is AED ${formatAed(customerTotal)} — type less for a part payment.`
                      : "Type less than the total for a part payment."}
                  </FieldHint>
                </div>
                <div>
                  <FieldLabel htmlFor="pay-method">Payment method</FieldLabel>
                  <SelectNative
                    id="pay-method"
                    value={payMethodId}
                    onChange={(e) => setPayMethodId(e.target.value)}
                    className="w-full text-[13px]"
                  >
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </SelectNative>
                  <FieldHint>How the money was taken.</FieldHint>
                </div>
                <div>
                  <FieldLabel htmlFor="pay-date">Received on</FieldLabel>
                  <Input
                    id="pay-date"
                    type="date"
                    value={payReceivedOn}
                    onChange={(e) => setPayReceivedOn(e.target.value)}
                    className="mono w-full text-[13px]"
                  />
                  <FieldHint>The date the money changed hands.</FieldHint>
                </div>
                <div>
                  <FieldLabel htmlFor="pay-ref">Reference (optional)</FieldLabel>
                  <Input
                    id="pay-ref"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Receipt no., txn id…"
                    className="w-full text-[13px]"
                  />
                  <FieldHint>Add a reference number if any.</FieldHint>
                </div>

                {/* Live read-out — a part payment must never be a surprise. */}
                <div className="sm:col-span-2 lg:col-span-4">
                  {payInvalid ? (
                    <p className="text-[13px] leading-[19px] text-error">
                      Enter an amount in AED with at most 2 decimals.
                    </p>
                  ) : payExceeds ? (
                    <p className="text-[13px] leading-[19px] text-error">
                      That is more than the customer owes (AED {formatAed(customerTotal)}). Enter
                      that amount or less — a genuine overpayment can be recorded on the invoice
                      itself, where it asks you to confirm.
                    </p>
                  ) : payFils !== null && payFils > 0 && payRemaining <= 0 ? (
                    <p className="text-[13px] leading-[19px] text-success">
                      Paid in full — AED {formatAed(customerTotal)}. Nothing will be outstanding.
                    </p>
                  ) : payFils !== null && payFils > 0 ? (
                    <p className="text-[13px] leading-[19px] text-warn">
                      Part payment — AED {formatAed(payFils)} now, AED {formatAed(payRemaining)} of
                      AED {formatAed(customerTotal)} left outstanding. Collect the rest on the
                      invoice page, in as many instalments as you like.
                    </p>
                  ) : (
                    <p className="text-[13px] leading-[19px] text-text-secondary">
                      Enter the amount the customer is handing over.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-[13px] leading-[19px] text-text-secondary">
                This invoice will be sealed <span className="font-[550]">unpaid</span>
                {customerTotal > 0 ? (
                  <>
                    {" "}
                    with AED <span className="mono">{formatAed(customerTotal)}</span> outstanding
                  </>
                ) : null}
                . Record the payment on the invoice page whenever it arrives — in full or in parts,
                as many times as needed.
              </p>
            )}

            {/* Due date stays visible in BOTH cases — deliberately not collapsed
                with the payment fields, because it is the field that matters most
                on a pay-later invoice. Blank by default (Q-11 unanswered). */}
            <div className="mt-4 border-t border-border pt-4">
              <FieldLabel htmlFor="pay-due">Due date (optional)</FieldLabel>
              <Input
                id="pay-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mono w-52 text-[13px]"
              />
              <FieldHint>
                {dueDate
                  ? "After this date an unpaid or part-paid invoice is flagged Overdue in the invoice list and in the sidebar count."
                  : "When the payment is due. Leave blank if you do not want this invoice tracked as overdue."}
              </FieldHint>
            </div>

            {/* What will actually happen, in one line, before they commit. */}
            <div className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-accent-border bg-accent-soft px-3.5 py-3">
              <Info className="mt-px size-[16px] shrink-0 text-primary" />
              <p className="text-[13px] leading-[19px] text-foreground">
                {payWhen === "later"
                  ? "The invoice will be issued Not Paid until you record a payment against it."
                  : payFils !== null && payFils > 0 && payRemaining <= 0
                    ? "The invoice will be marked Paid once this payment is recorded."
                    : payFils !== null && payFils > 0
                      ? "The invoice will be marked Partially Paid once this payment is recorded."
                      : "Enter an amount to record a payment as the invoice is issued."}
              </p>
            </div>
          </>
        )}
      </StepCard>

      {error ? <p className="text-right text-[13px] leading-[19px] text-error">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">
        {/* Deleting an existing draft (D-31) — quiet and on the far left, away
            from Save / Issue. Only ever offered for a draft that exists. */}
        {existing && canDelete ? (
          <button
            type="button"
            onClick={() =>
              deleteDraft(existing.id, {
                customerName: customer?.name ?? null,
                onDeleted: () => router.push("/invoices"),
              })
            }
            className="mr-auto inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-text-tertiary transition-colors hover:text-error"
          >
            <Trash2 className="size-4" /> Delete draft
          </button>
        ) : null}
        {savedAt ? (
          <span className="mono mr-1 text-[13px] text-text-tertiary">{savedAt}</span>
        ) : null}
        <Button variant="outline" onClick={saveDraft} loading={saving}>
          <Save /> {saving ? "Saving…" : "Save as Draft"}
        </Button>
        {/* The one action that seals. */}
        <Button onClick={startIssue} loading={saving}>
          <Send /> Issue Invoice
        </Button>
      </div>

      {/* Mandatory pre-issue preview (D-23): a slide-over on desktop, a
          drag-to-close bottom-sheet on phones (§2.5). Esc/outside-click/drag
          closes. Sealing happens ONLY from here. */}
      {/* D-23 put this slide-over at ~45–50%. At that width the A4 document was
          cramped and its header collided (owner screenshot 2026-07-30), so the
          preview is widened to 62% — still a slide-over, never the permanent
          split view D-23 actually rules out. */}
      <ResponsiveSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={previewMode === "look" ? "Invoice preview" : "Preview — confirm to issue"}
        desktopClassName="data-[side=right]:sm:w-[62%] data-[side=right]:sm:max-w-[62%]"
      >
        <p className={`mb-4 ${captionClass}`}>
          {previewMode === "look" ? "How this invoice will look" : "Preview — confirm to issue"}
        </p>
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
          displayCurrency={displayCurrency}
          exchangeRateE6={rateE6}
          deliveryFee={deliveryFils}
        />
        {previewMode === "look" ? (
          <>
            <p className="mt-4 text-[13px] leading-[19px] text-text-secondary">
              This is a look only — nothing has been saved and no number has been allocated. Close
              this and use <span className="font-[550]">Issue Invoice</span> when you are ready to
              seal it.
            </p>
            <div className="mt-5 flex justify-end pb-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-[13px] leading-[19px] text-text-secondary">
              Issuing allocates the next invoice number and this invoice becomes permanent — it
              cannot be edited afterwards. Totals are recomputed server-side at that moment;
              corrections happen via a new document. Nothing is printed automatically: you land on
              the sealed invoice and press Print there.
            </p>
            {/* Restate the step ⑤ decision at the point of no return. */}
            <p className="mt-2 text-[13px] leading-[19px] text-text-secondary">
              {payWhen === "now" && payFils && payFils > 0 ? (
                payFils >= customerTotal ? (
                  <>
                    Payment: <span className="font-[550]">AED {formatAed(payFils)}</span> will be
                    recorded against this invoice — paid in full.
                  </>
                ) : (
                  <>
                    Payment: <span className="font-[550]">AED {formatAed(payFils)}</span> will be
                    recorded, leaving AED {formatAed(customerTotal - payFils)} outstanding.
                  </>
                )
              ) : (
                <>
                  Payment: none — this invoice is issued <span className="font-[550]">unpaid</span>{" "}
                  and the balance is collected later.
                </>
              )}
              {dueDate ? <> Due {dueDate}.</> : null}
            </p>
            {issueError ? (
              <p className="mt-2 text-[13px] leading-[19px] text-error">{issueError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3 pb-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={confirming}>
                Keep editing
              </Button>
              <Button onClick={confirmIssue} loading={confirming}>
                {/* No "& print" any more — issuing no longer prints on its own. */}
                {confirming
                  ? "Issuing…"
                  : payWhen === "now"
                    ? "Issue & record payment"
                    : "Issue unpaid"}
              </Button>
            </div>
          </>
        )}
      </ResponsiveSheet>
    </div>
  );
}

// Numbered step card — the owner-mockup's Bill-to / Items / Details /
// Summary containers. Blue index badge + title, optional right-side action.
function StepCard({
  n,
  title,
  subtitle,
  caption,
  actions,
  children,
}: {
  n: number;
  title: string;
  /** parenthetical after the title, e.g. "(Optional)" */
  subtitle?: string;
  /** explanatory line under the title, per the owner's mockup */
  caption?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-on-accent">
            {n}
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {title}
              {subtitle ? (
                <span className="ml-1.5 text-[13px] font-normal text-text-tertiary">
                  ({subtitle})
                </span>
              ) : null}
            </h2>
            {caption ? (
              <p className="mt-0.5 text-[12px] leading-4 text-text-tertiary">{caption}</p>
            ) : null}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Two-letter monogram for the Bill To avatar — first letters of the first two
// words, falling back to the first two characters of a single-word name.
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Step ⑤ — the pay-now / pay-later decision. A real radio underneath (keyboard
// and screen readers get proper group semantics); the card is just its label.
function PayChoice({
  selected,
  onSelect,
  icon,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-3.5 transition-colors focus-within:border-primary focus-within:shadow-[var(--shadow-focus)] ${
        selected
          ? "border-primary bg-accent-soft"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      {/* The radio is the real control; visually hidden because the whole card
          is its label and carries the selected state. Still focusable. */}
      <input
        type="radio"
        name="pay-when"
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${selected ? "text-primary" : "text-text-tertiary"}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[13.5px] leading-[19px] font-[550] ${
            selected ? "text-primary" : "text-foreground"
          }`}
        >
          {title}
        </span>
        <span className="block text-[12px] leading-4 text-text-secondary">{detail}</span>
      </span>
    </label>
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
