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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { CustomerFormDialog, type DialogMode } from "./customer-form";
import type { CustomerRow } from "./page";

const col = createColumnHelper<CustomerRow>();

// Customers table (task 3.1): TanStack handles search/sort/filter/paging
// client-side over the RLS-scoped server fetch. Mutations go through
// /api/customers* and land back here via router.refresh().
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
          (showDeleted || r.deleted_at === null) &&
          (typeFilter === "all" || r.type === typeFilter)
      ),
    [rows, typeFilter, showDeleted]
  );

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Name",
        cell: (c) => (
          <div className="min-w-0">
            <Link
              href={`/customers/${c.row.original.id}`}
              className={`block truncate text-[13px] underline-offset-2 hover:underline ${c.row.original.deleted_at ? "text-ink-3 line-through" : "text-ink"}`}
            >
              {c.getValue()}
            </Link>
            {c.row.original.address ? (
              <p className="truncate text-[11px] text-ink-3">{c.row.original.address}</p>
            ) : null}
          </div>
        ),
      }),
      col.accessor("type", {
        header: "Type",
        cell: (c) => (
          <StatusChip variant={c.getValue() === "walk_in" ? "neutral" : "ink"}>
            {c.getValue() === "walk_in" ? "walk-in" : "regular"}
          </StatusChip>
        ),
      }),
      col.accessor("trn", {
        header: "TRN",
        cell: (c) => <span className="mono text-[12px] text-ink-2">{c.getValue() ?? "—"}</span>,
      }),
      col.accessor("phone", {
        header: "Phone",
        cell: (c) => <span className="mono text-[12px] text-ink-2">{c.getValue() ?? "—"}</span>,
      }),
      col.accessor("created_at", {
        header: "Since",
        cell: (c) => (
          <span className="mono text-[12px] text-ink-3">
            {new Date(c.getValue()).toISOString().slice(0, 10)}
          </span>
        ),
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="flex justify-end gap-1.5">
              {r.deleted_at === null ? (
                <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "edit", row: r })}>
                  Edit
                </Button>
              ) : null}
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => mutate(r.id, r.deleted_at === null ? "soft_delete" : "restore")}
                >
                  {r.deleted_at === null ? "Delete" : "Restore"}
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
    if (action === "soft_delete" && !window.confirm("Remove this customer? (Soft delete — an admin can restore.)"))
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
    initialState: { pagination: { pageSize: 25 } },
  });

  const regulars = rows.filter((r) => r.type === "regular" && r.deleted_at === null).length;
  const walkins = rows.filter((r) => r.type === "walk_in" && r.deleted_at === null).length;

  return (
    <div>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
        {regulars + walkins} customers on record — <em>{regulars} regular business clients</em> and{" "}
        <em>{walkins} walk-ins</em>. Walk-ins can be added with just a name; regular clients carry
        TRN, contact and address records.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search name, phone, TRN…"
          className="h-8 w-64 text-[13px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="h-8 rounded border border-hairline-strong bg-surface px-2 text-[12px] text-ink-2"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="regular">Regular</option>
          <option value="walk_in">Walk-in</option>
        </select>
        {isAdmin ? (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Show deleted
          </label>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "walk_in" })}>
            + Quick add walk-in
          </Button>
          <Button size="sm" onClick={() => setDialog({ kind: "regular" })}>
            + Add regular client
          </Button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto border border-hairline bg-surface">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-[1]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-hairline bg-surface-2">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className={`mono px-3 py-2.5 text-[10px] tracking-[0.14em] text-ink-3 uppercase ${
                      h.column.getCanSort() ? "cursor-pointer select-none" : ""
                    }`}
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
                className="h-[42px] border-b border-hairline last:border-b-0 hover:bg-accent/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-[13px] text-ink-3">
                  No customers match — adjust the search or add the first one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="mono text-[10px] text-ink-3">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </Button>
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
