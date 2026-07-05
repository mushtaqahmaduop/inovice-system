"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAed } from "@/lib/money";
import { ServiceFormDialog } from "./service-form";
import type { ServiceRow } from "./page";

// Services catalogue (task 3.3) — record-card grid per the approved
// prototype. Staff see the catalogue read-only; admin curates it.
export function ServicesView({ rows, isAdmin }: { rows: ServiceRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<{ row: ServiceRow | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = rows.filter(
    (r) =>
      (showDeleted || r.deleted_at === null) &&
      r.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function mutate(id: string, body: unknown) {
    setBusyId(id);
    const res = await fetch(`/api/services/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
    else window.alert((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  const active = rows.filter((r) => r.deleted_at === null).length;

  return (
    <div>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
        {active} services in the catalogue. Each has a <em>government fee</em> (passthrough, no
        VAT) and a <em>service fee</em> (revenue, taxable). Defaults fill into new invoices;
        staff can override on any line —{" "}
        {isAdmin ? "only you can change the defaults here." : "only the owner edits this catalogue."}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="h-8 w-64 text-[13px]"
        />
        {isAdmin ? (
          <>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
              />
              Show deleted
            </label>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setDialog({ row: null })}>
                + Add service
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((s) => (
          <div
            key={s.id}
            className={`border border-hairline bg-surface p-4 ${s.deleted_at || !s.is_active ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate text-[13.5px] font-medium text-ink ${s.deleted_at ? "line-through" : ""}`}>
                  {s.name}
                </p>
                <p className="text-[11px] text-ink-3">
                  per {s.unit} · {s.govt_fee > 0 ? "govt + service" : "typing only"}
                  {!s.is_active && !s.deleted_at ? " · inactive" : ""}
                </p>
              </div>
              {isAdmin && !s.deleted_at ? (
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setDialog({ row: s })}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => mutate(s.id, { action: "update", data: { isActive: !s.is_active } })}
                  >
                    {s.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => {
                      if (window.confirm("Remove from catalogue? (Soft delete — restorable.)"))
                        void mutate(s.id, { action: "soft_delete" });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
              {isAdmin && s.deleted_at ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === s.id}
                  onClick={() => mutate(s.id, { action: "restore" })}
                >
                  Restore
                </Button>
              ) : null}
            </div>
            <div className="mt-3 flex gap-4 border-t border-hairline pt-3">
              <div className="flex-1">
                <p className="mono mb-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                  Govt fee
                </p>
                <p className={`mono text-[15px] font-medium ${s.govt_fee > 0 ? "text-ink" : "text-ink-3"}`}>
                  {s.govt_fee > 0 ? `AED ${formatAed(s.govt_fee)}` : <span className="text-[12px] italic">none</span>}
                </p>
              </div>
              <div className="flex-1">
                <p className="mono mb-1 text-[9px] tracking-[0.14em] text-ink-3 uppercase">
                  Service fee
                </p>
                <p className="mono text-[15px] font-medium text-ink">AED {formatAed(s.service_fee)}</p>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="col-span-full border border-hairline bg-surface px-4 py-8 text-center text-[12px] text-ink-3">
            No services match.
          </p>
        ) : null}
      </div>

      {dialog ? (
        <ServiceFormDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
