"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Pencil,
  Power,
  Trash2,
  RotateCcw,
  Languages,
  FileText,
  IdCard,
  Stamp,
  Package,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatAed } from "@/lib/money";
import { ServiceFormDialog } from "./service-form";
import type { ServiceRow } from "./page";

// Services catalogue (task 3.3) — record-card grid, rebuilt for the Cool
// White / Federal Blue system against the owner's Services mockup: rounded
// cards with a category icon, compact icon actions, blue service-fee figure,
// and client-side pagination. Staff read the catalogue; admin curates it.

// Services carry no category field, so the card icon is a light
// name-keyword heuristic with a generic-document fallback — purely
// decorative, degrades gracefully for any future service name.
function serviceIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("translat")) return Languages;
  if (n.includes("visa") || n.includes("stamp")) return Stamp;
  if (n.includes("bundle") || n.includes("package")) return Package;
  if (n.includes("id") || n.includes("emirates") || n.includes("residency") || n.includes("licen"))
    return IdCard;
  return FileText;
}

const PER_PAGE_OPTIONS = [6, 12, 24];

export function ServicesView({ rows, isAdmin }: { rows: ServiceRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<{ row: ServiceRow | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(6);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (showDeleted || r.deleted_at === null) &&
          r.name.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [rows, showDeleted, query]
  );

  const active = rows.filter((r) => r.deleted_at === null).length;
  const pageCount = Math.max(1, Math.ceil(visible.length / perPage));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * perPage, current * perPage);

  async function mutate(id: string, body: unknown, successMsg = "Service updated") {
    setBusyId(id);
    const res = await fetch(`/api/services/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else toast.error((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  return (
    <div>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-text-secondary">
        {active} services in the catalogue. Each has a <em>government fee</em> (passthrough, no VAT)
        and a <em>service fee</em> (revenue, taxable). Defaults fill into new invoices; staff can
        override on any line —{" "}
        {isAdmin
          ? "only you can change the defaults here."
          : "only the owner edits this catalogue."}
      </p>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search services…"
            aria-label="Search services"
            className="h-10 w-72 pl-9 text-[13px]"
          />
        </div>
        {isAdmin ? (
          <label className="flex items-center gap-1.5 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
              className="size-3.5 accent-[var(--accent)]"
            />
            Show deleted
          </label>
        ) : null}
        {isAdmin ? (
          <Button className="ml-auto" onClick={() => setDialog({ row: null })}>
            <Plus /> Add service
          </Button>
        ) : null}
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageRows.map((s) => {
          const Icon = serviceIcon(s.name);
          const dimmed = s.deleted_at || !s.is_active;
          return (
            <div
              key={s.id}
              className={`flex flex-col rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[var(--shadow-popover)] ${
                dimmed ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[14px] leading-5 font-semibold text-foreground ${
                      s.deleted_at ? "line-through" : ""
                    }`}
                  >
                    {s.name}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-4 text-text-tertiary">
                    per {s.unit} · {s.govt_fee > 0 ? "govt + service" : "typing only"}
                    {!s.is_active && !s.deleted_at ? " · inactive" : ""}
                  </p>
                </div>
                {isAdmin && !s.deleted_at ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setDialog({ row: s })}
                      aria-label={`Edit ${s.name}`}
                      title="Edit"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={busyId === s.id}
                      onClick={() =>
                        mutate(
                          s.id,
                          { action: "update", data: { isActive: !s.is_active } },
                          s.is_active ? "Service deactivated" : "Service activated"
                        )
                      }
                      aria-label={s.is_active ? `Deactivate ${s.name}` : `Activate ${s.name}`}
                      title={s.is_active ? "Deactivate" : "Activate"}
                      className={s.is_active ? "text-text-secondary" : "text-success"}
                    >
                      <Power />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={busyId === s.id}
                      onClick={() => {
                        if (window.confirm("Remove from catalogue? (Soft delete — restorable.)"))
                          void mutate(s.id, { action: "soft_delete" }, "Service removed");
                      }}
                      aria-label={`Delete ${s.name}`}
                      title="Delete"
                      className="text-danger hover:bg-danger-soft"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
                {isAdmin && s.deleted_at ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => mutate(s.id, { action: "restore" }, "Service restored")}
                  >
                    <RotateCcw /> Restore
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 flex gap-4 border-t border-border pt-4">
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-text-tertiary uppercase">
                    Govt fee
                  </p>
                  <p
                    className={`mono text-[15px] font-semibold ${
                      s.govt_fee > 0 ? "text-foreground" : "text-text-tertiary"
                    }`}
                  >
                    {s.govt_fee > 0 ? `AED ${formatAed(s.govt_fee)}` : "None"}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-text-tertiary uppercase">
                    Service fee
                  </p>
                  <p className="mono text-[15px] font-semibold text-primary">
                    AED {formatAed(s.service_fee)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="col-span-full rounded-[14px] border border-border bg-surface px-4 py-10 text-center text-[13px] text-text-secondary">
            No services match — adjust the search, or add the first one to the catalogue.
          </p>
        ) : null}
      </div>

      {/* Pagination */}
      {visible.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                variant={p === current ? "default" : "outline"}
                size="icon-sm"
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? "page" : undefined}
                className="mono"
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon-sm"
              disabled={current >= pageCount}
              onClick={() => setPage(current + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Cards per page"
            className="ml-auto h-8 rounded-[8px] border border-border-strong bg-surface px-2 text-[13px] text-foreground focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none dark:bg-bg-sunken"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
