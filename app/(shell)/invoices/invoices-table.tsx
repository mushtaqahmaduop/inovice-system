"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { MoreVertical, Eye, Printer, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip, type ChipVariant } from "@/components/ui/status-chip";
import { formatAed } from "@/lib/money";
import type { InvoiceListRow } from "./page";

const col = createColumnHelper<InvoiceListRow>();

// Per-row actions menu (owner mockup ⋮). Self-contained open state so it
// doesn't force the memoized column set to rebuild; a full-screen backdrop
// catches the outside click. The row itself is already click-to-open, so
// this is a discoverable shortcut to Open / Print.
function RowMenu({
  status,
  onOpen,
  onPrint,
}: {
  status: InvoiceListRow["status"];
  onOpen: () => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical />
      </Button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute top-8 right-0 z-30 w-40 overflow-hidden rounded-[10px] border border-border bg-surface-raised py-1 shadow-[var(--shadow-popover)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
            >
              {status === "draft" ? <Pencil className="size-4" /> : <Eye className="size-4" />}
              {status === "draft" ? "Edit draft" : "Open"}
            </button>
            {status === "issued" ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPrint();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-bg-sunken"
              >
                <Printer className="size-4" /> Print
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// §2.3: dates in tables are mono and unambiguous — "07 Jul 2026".
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso + "T00:00:00Z")) : "—");

type Filter = "all" | "draft" | "issued" | "unpaid" | "paid" | "overdue" | "voided";

const FILTER_VALUES: Filter[] = ["all", "draft", "issued", "unpaid", "paid", "overdue", "voided"];

const EMPTY_COPY: Record<Filter, string> = {
  all: "No invoices yet — create your first one.",
  draft: "No open drafts.",
  issued: "No sealed invoices yet.",
  unpaid: "Nothing unpaid — you're all collected.",
  paid: "No paid invoices yet.",
  overdue: "No overdue invoices — nice.",
  voided: "No voided invoices.",
};

// One status chip per row (§5.7): lifecycle + payment merged. "Sealed" =
// issued, independent of payment (CLAUDE.md §5). Overdue is a pure display
// predicate — burnt orange, the ONLY use of that color — from due_date,
// falling back to issue_date + settings.due_days_default (Q-11: 7 days).
function rowChip(
  r: InvoiceListRow,
  overdue: boolean
): { variant: ChipVariant; label: string; title?: string } {
  if (r.status === "draft") return { variant: "neutral", label: "Draft" };
  if (r.status === "voided") return { variant: "warning", label: "Voided" };
  if (overdue) return { variant: "warning-filled", label: "Overdue" };
  if (r.payment_status === "paid") {
    const overpaid = r.grand_total !== null && r.paid_total > r.grand_total;
    return {
      variant: "success",
      label: overpaid ? "Paid ⚑ · sealed" : "Paid · sealed",
      title: overpaid ? `Overpaid: AED ${formatAed(r.paid_total)} received` : undefined,
    };
  }
  if (r.payment_status === "partial") {
    const outstanding = (r.grand_total ?? 0) - r.paid_total;
    return {
      variant: "warning",
      label: "Part-paid",
      title: `Paid AED ${formatAed(r.paid_total)} · AED ${formatAed(outstanding)} outstanding`,
    };
  }
  return { variant: "ink", label: "Sealed" };
}

export function InvoicesTable({
  rows,
  dueDaysDefault,
}: {
  rows: InvoiceListRow[];
  dueDaysDefault: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link entry point — e.g. the dashboard's unpaid banner links to
  // /invoices?filter=unpaid. Any unrecognized value falls back to "all"
  // rather than rendering an empty, confusing table.
  const initialFilter = searchParams.get("filter");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(
    FILTER_VALUES.includes(initialFilter as Filter) ? (initialFilter as Filter) : "all"
  );
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
        if (filter === "draft" && r.status !== "draft") return false;
        if (filter === "voided" && r.status !== "voided") return false;
        if (filter === "issued" && r.status !== "issued") return false;
        if (filter === "paid" && !(r.status === "issued" && r.payment_status === "paid"))
          return false;
        if (filter === "unpaid" && !(r.status === "issued" && r.payment_status !== "paid"))
          return false;
        if (filter === "overdue" && !isOverdue(r)) return false;
        if (fromDate && (r.issue_date ?? r.created_at.slice(0, 10)) < fromDate) return false;
        if (toDate && (r.issue_date ?? r.created_at.slice(0, 10)) > toDate) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filter, fromDate, toDate, dueDaysDefault]
  );

  const columns = useMemo(
    () => [
      col.accessor("invoice_number", {
        header: "Number",
        cell: (c) =>
          c.getValue() ? (
            <span className="mono text-[13px] font-semibold text-primary">{c.getValue()}</span>
          ) : (
            <span className="text-[13px] text-text-tertiary">Draft</span>
          ),
      }),
      col.accessor("customer_name", {
        header: "Customer",
        cell: (c) => (
          <span
            className="block max-w-[28ch] truncate text-[15px] text-foreground"
            title={c.getValue()}
          >
            {c.getValue()}
          </span>
        ),
      }),
      col.accessor("issue_date", {
        header: "Issued",
        cell: (c) => (
          <span className="mono text-[13px] text-text-secondary">{fmtDate(c.getValue())}</span>
        ),
      }),
      col.accessor("grand_total", {
        header: "Total",
        cell: (c) =>
          c.getValue() !== null ? (
            <span className="mono block text-right text-[15px] font-medium text-foreground">
              <span className="mr-1 text-[11px] font-normal text-text-tertiary">AED</span>
              {formatAed(c.getValue()!)}
            </span>
          ) : (
            <span className="block text-right text-[13px] text-text-tertiary">—</span>
          ),
      }),
      col.display({
        id: "state",
        header: "Status",
        cell: (c) => {
          const r = c.row.original;
          const chip = rowChip(r, isOverdue(r));
          return (
            <StatusChip variant={chip.variant} title={chip.title}>
              {chip.label}
            </StatusChip>
          );
        },
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) => {
          const r = c.row.original;
          return (
            <RowMenu
              status={r.status}
              onOpen={() =>
                router.push(r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`)
              }
              onPrint={() => router.push(`/invoices/${r.id}?print=1`)}
            />
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

  const openRow = (r: InvoiceListRow) =>
    router.push(r.status === "draft" ? `/invoices/${r.id}/edit` : `/invoices/${r.id}`);

  return (
    <div>
      {/* Toolbar: segmented filter + search + date range in one row (§4). */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Segmented
          aria-label="Filter invoices"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "issued", label: "Sealed" },
            { value: "unpaid", label: "Unpaid" },
            { value: "paid", label: "Paid" },
            { value: "overdue", label: "Overdue" },
            { value: "voided", label: "Voided" },
          ]}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search number or customer…"
          className="h-8 w-full text-[13px] sm:w-56"
        />
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="mono h-8 w-36 text-[12px]"
          aria-label="From date"
        />
        <span className="text-[12px] text-text-tertiary">–</span>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="mono h-8 w-36 text-[12px]"
          aria-label="To date"
        />
      </div>

      {/* Below sm the table becomes stacked cards keyed by the mono number;
          same filtered + paginated row model. */}
      <div className="max-h-[70vh] overflow-auto rounded-[12px] border border-border bg-surface sm:hidden">
        {table.getRowModel().rows.map((row) => {
          const r = row.original;
          const chip = rowChip(r, isOverdue(r));
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => openRow(r)}
              className="block w-full cursor-pointer border-b border-border px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-bg-sunken"
            >
              <div className="flex items-baseline justify-between gap-3">
                {r.invoice_number ? (
                  <span className="mono text-[13px] font-medium text-foreground">
                    {r.invoice_number}
                  </span>
                ) : (
                  <span className="text-[13px] text-text-tertiary">Draft</span>
                )}
                {r.grand_total !== null ? (
                  <span className="mono text-[13px] text-foreground">
                    <span className="mr-1 text-[11px] text-text-tertiary">AED</span>
                    {formatAed(r.grand_total)}
                  </span>
                ) : (
                  <span className="text-[13px] text-text-tertiary">—</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-text-secondary">{r.customer_name}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="mono text-[12px] text-text-tertiary">{fmtDate(r.issue_date)}</span>
                <StatusChip variant={chip.variant}>{chip.label}</StatusChip>
              </div>
            </button>
          );
        })}
        {table.getRowModel().rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-[13px] text-text-secondary">
            {EMPTY_COPY[filter]}
          </p>
        ) : null}
      </div>

      <div className="hidden max-h-[70vh] overflow-auto rounded-[12px] border border-border bg-surface sm:block">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-[1]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border-strong bg-surface">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className={`px-3 py-2.5 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase ${
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
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => openRow(row.original)}
                className="h-12 cursor-pointer border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-bg-sunken"
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
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-[13px] text-text-secondary"
                >
                  {EMPTY_COPY[filter]}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          {Array.from({ length: table.getPageCount() }, (_, i) => i).map((p) => (
            <Button
              key={p}
              variant={p === table.getState().pagination.pageIndex ? "default" : "outline"}
              size="icon-sm"
              onClick={() => table.setPageIndex(p)}
              aria-label={`Page ${p + 1}`}
              aria-current={p === table.getState().pagination.pageIndex ? "page" : undefined}
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
      ) : null}
    </div>
  );
}
