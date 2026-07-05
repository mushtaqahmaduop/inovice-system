"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

const KINDS = [
  { kind: "invoices", label: "Invoices", hint: "one row per sealed/voided document" },
  { kind: "payments", label: "Payments", hint: "the full ledger incl. reversals" },
  { kind: "vat", label: "VAT report basis", hint: "per-period figures for the accountant" },
] as const;

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 border border-hairline bg-surface p-4">
        <div>
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="exp-from">
            From (issue / received date)
          </label>
          <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mono h-8 w-40 text-[11.5px]" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-3" htmlFor="exp-to">
            To
          </label>
          <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mono h-8 w-40 text-[11.5px]" />
        </div>
        <p className="text-[10px] text-ink-4">Leave empty for everything.</p>
      </div>

      <div className="divide-y divide-hairline border border-hairline bg-surface">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink">{k.label}</p>
              <p className="text-[11px] text-ink-3">{k.hint}</p>
            </div>
            <a
              href={`/api/export/${k.kind}${query()}`}
              download
              className="mono inline-flex h-7 shrink-0 items-center rounded border border-hairline-strong bg-surface px-2.5 text-[11px] text-ink-2 hover:border-ink-3 hover:text-ink"
            >
              Download CSV
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
