"use client";

import { useMemo, useState } from "react";
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
import { formatAed } from "@/lib/money";
import { toRoman } from "@/lib/invoice-calc";
import type { InvoiceListRow } from "./page";

const col = createColumnHelper<InvoiceListRow>();

// Invoice list table (task 4.3). "Sealed" = issued, independent of payment
// (CLAUDE.md §5 vocabulary). Overdue is a pure display predicate — burnt
// orange, the ONLY use of that color — from due_date, falling back to
// issue_date + settings.due_days_default until Q-11 answers.
export function InvoicesTable({
  rows,
  dueDaysDefault,
}: {
  rows: InvoiceListRow[];
  dueDaysDefault: number | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "issued" | "voided">("all");
  const [payFilter, setPayFilter] = useState<"all" | "unpaid" | "partial" | "paid" | "overdue">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (r: InvoiceListRow): boolean => {
    if (r.status !== "issued" || r.payment_status === "paid") return false;
    const due =
      r.due_date ??
      (r.issue_date && dueDaysDefault !== null
        ? new Date(new Date(r.issue_date).getTime() + dueDaysDefault * 86400000)
            .toISOString()
            .slice(0, 10)
        : null);
    return due !== null && due < today;
  };

  const data = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (payFilter === "overdue") {
          if (!isOverdue(r)) return false;
        } else if (payFilter !== "all" && r.payment_status !== payFilter) return false;
        if (fromDate && (r.issue_date ?? r.created_at.slice(0, 10)) < fromDate) return false;
        if (toDate && (r.issue_date ?? r.created_at.slice(0, 10)) > toDate) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, statusFilter, payFilter, fromDate, toDate, dueDaysDefault]
  );

  const columns = useMemo(
    () => [
      col.display({
        id: "idx",
        header: "№",
        cell: (c) => (
          <span className="mono text-[10px] text-ink-3">
            {toRoman(c.row.index + 1 + c.table.getState().pagination.pageIndex * 25)}
          </span>
        ),
      }),
      col.accessor("invoice_number", {
        header: "Number",
        cell: (c) =>
          c.getValue() ? (
            <span className="mono text-[12.5px] text-ink">{c.getValue()}</span>
          ) : (
            <span className="mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">draft</span>
          ),
      }),
      col.accessor("customer_name", {
        header: "Customer",
        cell: (c) => <span className="truncate text-[13px] text-ink">{c.getValue()}</span>,
      }),
      col.accessor("issue_date", {
        header: "Issued",
        cell: (c) => <span className="mono text-[11.5px] text-ink-3">{c.getValue() ?? "—"}</span>,
      }),
      col.accessor("grand_total", {
        header: "Total",
        cell: (c) =>
          c.getValue() !== null ? (
            <span className="mono block text-right text-[12.5px] text-ink">
              <span className="mr-1 text-[10px] text-ink-3">AED</span>
              {formatAed(c.getValue()!)}
            </span>
          ) : (
            <span className="block text-right text-[11px] text-ink-4">—</span>
          ),
      }),
      col.accessor("status", {
        header: "Status",
        cell: (c) => {
          const s = c.getValue();
          if (s === "issued") return <StatusChip variant="ink">· sealed ·</StatusChip>;
          if (s === "voided") return <StatusChip variant="warning">voided</StatusChip>;
          return <StatusChip variant="neutral">draft</StatusChip>;
        },
      }),
      col.display({
        id: "payment",
        header: "Payment",
        cell: (c) => {
          const r = c.row.original;
          if (r.status !== "issued") return <span className="text-[11px] text-ink-4">—</span>;
          if (isOverdue(r)) {
            return <StatusChip variant="warning-filled">overdue</StatusChip>;
          }
          const overpaid =
            r.payment_status === "paid" && r.grand_total !== null && r.paid_total > r.grand_total;
          return (
            <StatusChip
              variant={r.payment_status === "paid" ? "success" : "neutral"}
              title={overpaid ? `Overpaid: AED ${formatAed(r.paid_total)} received` : undefined}
            >
              {r.payment_status}
              {overpaid ? " ⚑" : ""}
            </StatusChip>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dueDaysDefault]
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: query, sorting },
    onGlobalFilterChange: setQuery,
    onSortingChange: setSorting,
    globalFilterFn: (row, _c, value) => {
      const q = String(value).toLowerCase();
      const r = row.original;
      return (
        r.customer_name.toLowerCase().includes(q) ||
        (r.invoice_number ?? "").toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const issued = rows.filter((r) => r.status === "issued").length;
  const drafts = rows.filter((r) => r.status === "draft").length;

  return (
    <div>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
        {rows.length} invoices on record — <em>{issued} sealed</em>
        {drafts > 0 ? (
          <>
            {" and "}
            <em>{drafts} open drafts</em>
          </>
        ) : null}
        . Payment status is derived from recorded payments; sealed invoices are immutable.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search number or customer…"
          className="h-8 w-full text-[13px] sm:w-60"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="h-8 rounded border border-hairline-strong bg-surface px-2 text-[12px] text-ink-2"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="draft">Drafts</option>
          <option value="issued">Sealed</option>
          <option value="voided">Voided</option>
        </select>
        <select
          value={payFilter}
          onChange={(e) => setPayFilter(e.target.value as typeof payFilter)}
          className="h-8 rounded border border-hairline-strong bg-surface px-2 text-[12px] text-ink-2"
          aria-label="Filter by payment"
        >
          <option value="all">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="mono h-8 w-36 text-[11px]"
          aria-label="From date"
        />
        <span className="text-[11px] text-ink-4">–</span>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="mono h-8 w-36 text-[11px]"
          aria-label="To date"
        />
      </div>

      {/* DESIGN_BRIEF §3 #10 — below sm the table becomes stacked cards
          keyed by the mono number; same filtered + paginated row model. */}
      <div className="max-h-[70vh] overflow-auto border border-hairline bg-surface sm:hidden">
        {table.getRowModel().rows.map((row) => {
          const r = row.original;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() =>
                router.push(r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`)
              }
              className="block w-full border-b border-hairline px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/50"
            >
              <div className="flex items-baseline justify-between gap-3">
                {r.invoice_number ? (
                  <span className="mono text-[12.5px] text-ink">{r.invoice_number}</span>
                ) : (
                  <span className="mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
                    draft
                  </span>
                )}
                {r.grand_total !== null ? (
                  <span className="mono text-[12.5px] text-ink">
                    <span className="mr-1 text-[10px] text-ink-3">AED</span>
                    {formatAed(r.grand_total)}
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-4">—</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-ink-2">{r.customer_name}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="mono text-[11px] text-ink-3">{r.issue_date ?? "—"}</span>
                <span className="flex items-center gap-1.5">
                  {r.status === "issued" ? (
                    <StatusChip variant="ink">· sealed ·</StatusChip>
                  ) : r.status === "voided" ? (
                    <StatusChip variant="warning">voided</StatusChip>
                  ) : (
                    <StatusChip variant="neutral">draft</StatusChip>
                  )}
                  {r.status === "issued" ? (
                    isOverdue(r) ? (
                      <StatusChip variant="warning-filled">overdue</StatusChip>
                    ) : (
                      <StatusChip variant={r.payment_status === "paid" ? "success" : "neutral"}>
                        {r.payment_status}
                      </StatusChip>
                    )
                  ) : null}
                </span>
              </div>
            </button>
          );
        })}
        {table.getRowModel().rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-[13px] text-ink-3">
            No invoices match — adjust the filters or create the first one.
          </p>
        ) : null}
      </div>

      <div className="hidden max-h-[70vh] overflow-auto border border-hairline bg-surface sm:block">
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
                    } ${h.column.id === "grand_total" ? "text-right" : ""}`}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              return (
                <tr
                  key={row.id}
                  onClick={() =>
                    router.push(r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`)
                  }
                  className="h-[42px] cursor-pointer border-b border-hairline last:border-b-0 hover:bg-accent/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-[13px] text-ink-3">
                  No invoices match — adjust the filters or create the first one.
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
    </div>
  );
}
