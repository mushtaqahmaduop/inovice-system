"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResults = {
  customers: { id: string; name: string; type: "regular" | "walk_in" }[];
  invoices: { id: string; invoice_number: string | null; status: string; customer_name: string | null }[];
};

const EMPTY: SearchResults = { customers: [], invoices: [] };

// Global search (task 2.3 scaffold, wired in 4.3, D-18): Ctrl/⌘-K palette
// over the trigram indexes through the RLS-scoped /api/search route.
// Invoice rows open the sealed detail view; customer rows open the
// per-customer ledger (5.2).
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQ("");
      setResults(EMPTY);
    }
  }, [open]);

  const runSearch = useCallback((query: string) => {
    abortRef.current?.abort();
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : EMPTY))
      .then((data: SearchResults) => {
        setResults({ customers: data.customers ?? [], invoices: data.invoices ?? [] });
        setSearching(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setSearching(false);
      });
  }, []);

  // Debounced fetch — the trigram search is cheap but keystrokes are cheaper.
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const empty = q.trim().length >= 2 && !searching && !results.customers.length && !results.invoices.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-2 rounded border border-hairline-strong bg-surface px-2.5 text-xs text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
        aria-label="Search (Ctrl+K)"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3.5 w-3.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="mono hidden text-[9px] tracking-[0.08em] text-ink-4 sm:inline">CTRL K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-24"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
        >
          <div className="w-full max-w-lg border border-hairline-strong bg-surface shadow-lg">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search customers or invoice numbers…"
              className="h-11 w-full border-b border-hairline bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            <div className="max-h-80 overflow-y-auto p-2">
              {results.invoices.length > 0 ? (
                <div className="mb-2">
                  <p className="mono px-2 pb-1 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
                    Invoices
                  </p>
                  {results.invoices.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push(`/invoices/${inv.id}`);
                      }}
                      className="flex w-full items-center gap-3 px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                    >
                      <span className="mono text-ink">{inv.invoice_number ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">{inv.customer_name}</span>
                      <span className="mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                        {inv.status}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {results.customers.length > 0 ? (
                <div className="mb-1">
                  <p className="mono px-2 pb-1 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
                    Customers
                  </p>
                  {results.customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        router.push(`/customers/${c.id}`);
                      }}
                      className="flex w-full items-center gap-3 px-2 py-1.5 text-left text-[13px] hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                      <span className="mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                        {c.type === "walk_in" ? "walk-in" : "regular"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {searching ? (
                <p className="px-2 py-3 text-xs text-ink-3">Searching…</p>
              ) : empty ? (
                <p className="px-2 py-3 text-xs text-ink-3">No matches.</p>
              ) : q.trim().length < 2 ? (
                <p className="px-2 py-3 text-xs text-ink-3">
                  Type at least two characters — customers and invoice numbers.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
