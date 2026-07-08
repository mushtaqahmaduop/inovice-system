"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  Search,
  Plus,
  UserPlus,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerFormDialog, type DialogMode } from "./customer-form";
import type { CustomerRow } from "./page";

const col = createColumnHelper<CustomerRow>();

// "08 Jul 2026" in the business timezone (server clock is UTC on Vercel).
function fmtSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Customers table (task 3.1), rebuilt for the Cool White / Federal Blue
// system against the owner's Customers mockup: avatar initials, soft type
// pill, compact icon actions, styled pagination with a per-page selector.
// TanStack still handles search/sort/filter/paging client-side over the
// RLS-scoped server fetch; mutations go through /api/customers* and land
// back via router.refresh().
export function CustomersView({ rows, isAdmin }: { rows: CustomerRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "walk_in">("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          (showDeleted || r.deleted_at === null) && (typeFilter === "all" || r.type === typeFilter)
      ),
    [rows, typeFilter, showDeleted]
  );

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Name",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
                {initials(r.name)}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/customers/${r.id}`}
                  className={`block truncate text-[14px] font-semibold underline-offset-2 hover:underline ${
                    r.deleted_at ? "text-text-tertiary line-through" : "text-foreground"
                  }`}
                >
                  {c.getValue()}
                </Link>
                <p className="truncate text-[12px] text-text-tertiary">
                  {r.type === "walk_in" ? "Walk-in customer" : "Regular client"}
                </p>
              </div>
            </div>
          );
        },
      }),
      col.accessor("type", {
        header: "Type",
        cell: (c) => (
          <span
            className={
              c.getValue() === "walk_in"
                ? "inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-primary"
                : "inline-flex rounded-full bg-neutral-soft px-2.5 py-0.5 text-[12px] font-medium text-text-secondary"
            }
          >
            {c.getValue() === "walk_in" ? "Walk-in" : "Regular"}
          </span>
        ),
      }),
      col.accessor("trn", {
        header: "TRN",
        cell: (c) => (
          <span className="mono text-[12px] text-text-secondary">{c.getValue() ?? "—"}</span>
        ),
      }),
      col.accessor("phone", {
        header: "Phone",
        cell: (c) => (
          <span className="mono text-[12px] text-text-secondary">{c.getValue() ?? "—"}</span>
        ),
      }),
      col.accessor("created_at", {
        header: "Since",
        cell: (c) => (
          <span className="mono text-[12px] text-text-tertiary">{fmtSince(c.getValue())}</span>
        ),
      }),
      col.display({
        id: "actions",
        header: "Actions",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="flex justify-end gap-1">
              {r.deleted_at === null ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setDialog({ kind: "edit", row: r })}
                  aria-label={`Edit ${r.name}`}
                  title="Edit"
                >
                  <Pencil />
                </Button>
              ) : null}
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={busyId === r.id}
                  onClick={() => mutate(r.id, r.deleted_at === null ? "soft_delete" : "restore")}
                  aria-label={r.deleted_at === null ? `Delete ${r.name}` : `Restore ${r.name}`}
                  title={r.deleted_at === null ? "Delete" : "Restore"}
                  className={r.deleted_at === null ? "text-danger hover:bg-danger-soft" : ""}
                >
                  {r.deleted_at === null ? <Trash2 /> : <RotateCcw />}
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, busyId]
  );

  async function mutate(id: string, action: "soft_delete" | "restore") {
    if (
      action === "soft_delete" &&
      !window.confirm("Remove this customer? (Soft delete — an admin can restore.)")
    )
      return;
    setBusyId(id);
    const res = await fetch(`/api/customers/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (res.ok) router.refresh();
    else window.alert((await res.json().catch(() => null))?.error ?? "Request failed");
  }

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: (row, _colId, value) => {
      const q = String(value).toLowerCase();
      const r = row.original;
      return [r.name, r.phone, r.trn, r.email].some((f) => f?.toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const regulars = rows.filter((r) => r.type === "regular" && r.deleted_at === null).length;
  const walkins = rows.filter((r) => r.type === "walk_in" && r.deleted_at === null).length;

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const shownFrom = filteredCount === 0 ? 0 : pageIndex * pageSize + 1;
  const shownTo = Math.min(filteredCount, (pageIndex + 1) * pageSize);
  const pageCount = table.getPageCount();

  return (
    <div>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-text-secondary">
        {regulars + walkins} customers on record — <em>{regulars} regular business clients</em> and{" "}
        <em>{walkins} walk-ins</em>. Walk-ins can be added with just a name; regular clients carry
        TRN, contact and address records.
      </p>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search name, phone, TRN…"
            aria-label="Search customers"
            className="h-10 w-72 pl-9 text-[13px]"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="h-10 rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] text-foreground focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none dark:bg-bg-sunken"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="regular">Regular</option>
          <option value="walk_in">Walk-in</option>
        </select>
        {isAdmin ? (
          <label className="flex items-center gap-1.5 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="size-3.5 accent-[var(--accent)]"
            />
            Show deleted
          </label>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ kind: "walk_in" })}>
            <UserPlus /> Quick add walk-in
          </Button>
          <Button onClick={() => setDialog({ kind: "regular" })}>
            <Plus /> Add regular client
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className={`px-4 py-3 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase ${
                      h.column.id === "actions" ? "text-right" : ""
                    } ${h.column.getCanSort() ? "cursor-pointer select-none" : ""}`}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-sunken/60"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-[13px] text-text-secondary"
                >
                  No customers match — adjust the search or add the first one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <p className="text-[13px] text-text-secondary">
            Showing {shownFrom}–{shownTo} of {filteredCount} customers
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {Array.from({ length: pageCount }, (_, i) => i).map((p) => (
              <Button
                key={p}
                variant={p === pageIndex ? "default" : "outline"}
                size="icon-sm"
                onClick={() => table.setPageIndex(p)}
                aria-label={`Page ${p + 1}`}
                aria-current={p === pageIndex ? "page" : undefined}
                className="mono"
              >
                {p + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 rounded-[8px] border border-border-strong bg-surface px-2 text-[13px] text-foreground focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none dark:bg-bg-sunken"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {dialog ? (
        <CustomerFormDialog
          mode={dialog}
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
