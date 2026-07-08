"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Clock,
  FileText,
  Briefcase,
  FilePlus,
  UserPlus,
  Plus,
  ChevronRight,
  CornerDownLeft,
} from "lucide-react";
import { formatAed } from "@/lib/money";

type Customer = { id: string; name: string; type: "regular" | "walk_in"; phone: string | null };
type Invoice = {
  id: string;
  invoice_number: string | null;
  status: string;
  payment_status: "unpaid" | "partial" | "paid" | null;
  grand_total: number | null;
  issue_date: string | null;
  customer_name: string | null;
};
type Service = { id: string; name: string; unit: string; service_fee: number };
type SearchResults = {
  customers: Customer[];
  customersTotal: number;
  invoices: Invoice[];
  invoicesTotal: number;
  services: Service[];
  servicesTotal: number;
};

const EMPTY: SearchResults = {
  customers: [],
  customersTotal: 0,
  invoices: [],
  invoicesTotal: 0,
  services: [],
  servicesTotal: 0,
};

const RECENT_KEY = "search:recent";
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso + "T00:00:00Z")) : "");

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// One flat, keyboard-navigable entry. `render` draws the row; `run` fires on
// click or Enter. The group headings and "View all" links are mouse-only and
// stay out of `flat` so the arrow keys walk actual results + quick actions.
type Item = { id: string; run: () => void; render: (active: boolean) => ReactNode };

// Global search (task 2.3 / 4.3 → rich command palette, search.png): Ctrl/⌘-K
// over the RLS-scoped /api/search route. Recent searches persist in
// localStorage; results group into customers / invoices / services with
// per-group totals; quick actions and keyboard navigation round it out.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      try {
        setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
      } catch {
        setRecent([]);
      }
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
        setResults({ ...EMPTY, ...data });
        setSearching(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setSearching(false);
      });
  }, []);

  // Debounced fetch — trigram search is cheap but keystrokes are cheaper.
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const rememberQuery = useCallback(
    (term: string) => {
      const t = term.trim();
      if (t.length < 2) return;
      const next = [t, ...recent.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // best-effort
      }
    },
    [recent]
  );

  const clearRecent = () => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // best-effort
    }
  };

  const go = useCallback(
    (path: string) => {
      rememberQuery(q);
      setOpen(false);
      router.push(path);
    },
    [q, rememberQuery, router]
  );

  const hasQuery = q.trim().length >= 2;

  // Build the flat, ordered, keyboard-navigable item list for the current
  // mode (recent vs. results), followed by the always-present quick actions.
  const flat = useMemo<Item[]>(() => {
    const items: Item[] = [];
    const rowBase =
      "flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors";

    if (!hasQuery) {
      recent.forEach((term) =>
        items.push({
          id: `recent:${term}`,
          run: () => {
            setQ(term);
            inputRef.current?.focus();
          },
          render: (a) => (
            <div className={`${rowBase} ${a ? "bg-bg-sunken" : "hover:bg-bg-sunken"}`}>
              <Clock className="size-4 shrink-0 text-text-tertiary" />
              <span className="min-w-0 flex-1 truncate text-foreground">{term}</span>
              <ChevronRight className="size-4 shrink-0 text-text-tertiary" />
            </div>
          ),
        })
      );
    } else {
      results.customers.forEach((c) =>
        items.push({
          id: `cust:${c.id}`,
          run: () => go(`/customers/${c.id}`),
          render: (a) => (
            <div className={`${rowBase} ${a ? "bg-bg-sunken" : "hover:bg-bg-sunken"}`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-primary">
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {c.name}
                <span className="ml-2 text-[12px] text-text-tertiary">
                  {c.type === "walk_in" ? "Walk-in Customer" : "Regular"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-text-tertiary" />
            </div>
          ),
        })
      );
      results.invoices.forEach((inv) =>
        items.push({
          id: `inv:${inv.id}`,
          run: () =>
            go(inv.status === "draft" ? `/invoices/${inv.id}/edit` : `/invoices/${inv.id}`),
          render: (a) => (
            <div className={`${rowBase} ${a ? "bg-bg-sunken" : "hover:bg-bg-sunken"}`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-primary">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="mono font-semibold text-foreground">
                  {inv.invoice_number ?? "Draft"}
                </span>
                <span className="ml-2 text-[12px] text-text-tertiary">
                  {inv.customer_name ?? "—"}
                  {inv.issue_date ? ` · Issued ${fmtDate(inv.issue_date)}` : ""}
                </span>
              </span>
              {inv.payment_status === "paid" ? (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                  Paid
                </span>
              ) : null}
              {inv.grand_total !== null ? (
                <span className="mono shrink-0 text-[13px] text-foreground">
                  <span className="mr-1 text-[11px] text-text-tertiary">AED</span>
                  {formatAed(inv.grand_total)}
                </span>
              ) : null}
            </div>
          ),
        })
      );
      results.services.forEach((s) =>
        items.push({
          id: `svc:${s.id}`,
          run: () => go(`/services`),
          render: (a) => (
            <div className={`${rowBase} ${a ? "bg-bg-sunken" : "hover:bg-bg-sunken"}`}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#efe9fd] text-[#7c3aed] dark:bg-[#2a2350] dark:text-[#b79cf5]">
                <Briefcase className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {s.name}
                <span className="ml-2 text-[12px] text-text-tertiary">per {s.unit}</span>
              </span>
              <span className="mono shrink-0 text-[13px] text-foreground">
                <span className="mr-1 text-[11px] text-text-tertiary">AED</span>
                {formatAed(s.service_fee)}
              </span>
            </div>
          ),
        })
      );
    }

    // Quick actions (always present).
    const action = (id: string, Icon: typeof Plus, label: string, path: string): Item => ({
      id,
      run: () => go(path),
      render: (a) => (
        <div
          className={`flex items-center justify-center gap-2 rounded-[10px] border border-border px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors ${
            a ? "border-accent-border bg-accent-soft text-primary" : "hover:bg-bg-sunken"
          }`}
        >
          <Icon className="size-4 text-primary" /> {label}
        </div>
      ),
    });
    items.push(action("qa:invoice", FilePlus, "Create Invoice", "/invoices/new"));
    items.push(action("qa:customer", UserPlus, "Add Customer", "/customers"));
    items.push(action("qa:service", Plus, "Add Service", "/services"));

    return items;
  }, [hasQuery, recent, results, go]);

  const indexOf = useCallback((id: string) => flat.findIndex((i) => i.id === id), [flat]);

  useEffect(() => {
    setActive(0);
  }, [q, results, recent, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[active]?.run();
    }
  };

  const noResults =
    hasQuery &&
    !searching &&
    results.customers.length === 0 &&
    results.invoices.length === 0 &&
    results.services.length === 0;

  // A group of result rows with a heading and an optional "View all (N)".
  const Group = ({
    heading,
    total,
    shown,
    viewAll,
    children,
  }: {
    heading: string;
    total: number;
    shown: number;
    viewAll: () => void;
    children: ReactNode;
  }) =>
    shown > 0 ? (
      <div className="px-1 pt-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
            {heading}
          </span>
          {total > shown ? (
            <button
              type="button"
              onClick={viewAll}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              View all ({total})
            </button>
          ) : null}
        </div>
        {children}
      </div>
    ) : null;

  const row = (item: Item) => (
    <button
      key={item.id}
      type="button"
      onClick={item.run}
      onMouseMove={() => setActive(indexOf(item.id))}
      className="block w-full"
    >
      {item.render(indexOf(item.id) === active)}
    </button>
  );

  const byId = (id: string) => flat.find((i) => i.id === id);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full max-w-[440px] cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-tertiary transition-colors duration-150 outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="hidden truncate sm:inline">Search invoices, customers…</span>
        <kbd className="mono ml-auto hidden shrink-0 rounded border border-border-strong px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-text-tertiary sm:inline">
          Ctrl K
        </kbd>
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
          <div className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] border border-border bg-surface-raised shadow-[var(--shadow-drawer)]">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-text-tertiary" strokeWidth={1.75} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search customers, invoices, services…"
                className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-text-tertiary"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {/* Recent searches (idle) */}
              {!hasQuery && recent.length > 0 ? (
                <div className="px-1 pt-2">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <span className="text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                      Recent searches
                    </span>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  {recent.map((term) => {
                    const item = byId(`recent:${term}`);
                    return item ? row(item) : null;
                  })}
                </div>
              ) : null}

              {/* Results */}
              {hasQuery ? (
                <>
                  <Group
                    heading="Customers"
                    total={results.customersTotal}
                    shown={results.customers.length}
                    viewAll={() => go("/customers")}
                  >
                    {results.customers.map((c) => {
                      const item = byId(`cust:${c.id}`);
                      return item ? row(item) : null;
                    })}
                  </Group>
                  <Group
                    heading="Invoices"
                    total={results.invoicesTotal}
                    shown={results.invoices.length}
                    viewAll={() => go("/invoices")}
                  >
                    {results.invoices.map((inv) => {
                      const item = byId(`inv:${inv.id}`);
                      return item ? row(item) : null;
                    })}
                  </Group>
                  <Group
                    heading="Services"
                    total={results.servicesTotal}
                    shown={results.services.length}
                    viewAll={() => go("/services")}
                  >
                    {results.services.map((s) => {
                      const item = byId(`svc:${s.id}`);
                      return item ? row(item) : null;
                    })}
                  </Group>
                  {searching ? (
                    <p className="px-3 py-3 text-[13px] text-text-tertiary">Searching…</p>
                  ) : noResults ? (
                    <p className="px-3 py-3 text-[13px] text-text-secondary">
                      No matches for “{q.trim()}”.
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* Quick actions */}
              <div className="px-1 pt-3 pb-1">
                <p className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                  Quick actions
                </p>
                <div className="grid grid-cols-1 gap-2 px-1 sm:grid-cols-3">
                  {["qa:invoice", "qa:customer", "qa:service"].map((id) => {
                    const item = byId(id);
                    return item ? row(item) : null;
                  })}
                </div>
              </div>
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[12px] text-text-tertiary">
              <span>Type at least 2 characters to search</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="mono rounded border border-border-strong px-1 text-[10px]">
                    ↑↓
                  </kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="mono flex items-center rounded border border-border-strong px-1 text-[10px]">
                    <CornerDownLeft className="size-3" />
                  </kbd>
                  Open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="mono rounded border border-border-strong px-1 text-[10px]">
                    Esc
                  </kbd>
                  Close
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
