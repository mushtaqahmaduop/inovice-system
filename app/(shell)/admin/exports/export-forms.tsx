"use client";

import { useState } from "react";
import { FileText, CreditCard, BarChart3, Download, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

// Colored icon tiles per the owner's Exports mockup. The violet on the VAT
// tile is a one-off decorative accent (no violet token), like the print doc
// exception; blue/green come from --accent / --success.
const KINDS: {
  kind: "invoices" | "payments" | "vat";
  label: string;
  hint: string;
  Icon: LucideIcon;
  tile: string;
}[] = [
  {
    kind: "invoices",
    label: "Invoices",
    hint: "one row per sealed/voided document",
    Icon: FileText,
    tile: "bg-accent-soft text-primary",
  },
  {
    kind: "payments",
    label: "Payments",
    hint: "the full ledger incl. reversals",
    Icon: CreditCard,
    tile: "bg-success-soft text-success",
  },
  {
    kind: "vat",
    label: "VAT report basis",
    hint: "per-period figures for the accountant",
    Icon: BarChart3,
    tile: "bg-[#efe9fd] text-[#7c3aed] dark:bg-[#2a2350] dark:text-[#b79cf5]",
  },
];

export function ExportForms() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      {/* Date range */}
      <div className="flex flex-wrap items-end gap-5 rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div>
          <FieldLabel htmlFor="exp-from">From (issue / received date)</FieldLabel>
          <Input
            id="exp-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mono h-10 w-52 text-[13px]"
          />
        </div>
        <div>
          <FieldLabel htmlFor="exp-to">To</FieldLabel>
          <Input
            id="exp-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mono h-10 w-52 text-[13px]"
          />
        </div>
        <p className="pb-2.5 text-[13px] text-text-tertiary">Leave empty for everything.</p>
      </div>

      {/* Download cards */}
      <div className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex items-center gap-4 px-5 py-4">
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-[12px] ${k.tile}`}
            >
              <k.Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">{k.label}</p>
              <p className="text-[12px] text-text-tertiary">{k.hint}</p>
            </div>
            <a
              href={`/api/export/${k.kind}${query()}`}
              download
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border-strong bg-transparent px-4 text-[13px] font-[550] text-primary transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Download className="size-4" /> Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
