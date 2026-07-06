"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaymentMethodRow } from "./page";

// Payment methods (D-25/R-2): admin edits rows; nothing is ever deleted —
// payments FK these rows forever. Deactivate hides a method from new
// payments without touching history.
export function PaymentMethodsManager({ methods }: { methods: PaymentMethodRow[] }) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    setError((await res.json().catch(() => null))?.error ?? "Request failed");
    return false;
  }

  async function add() {
    if (!newLabel.trim()) return;
    const maxPos = methods.reduce((m, x) => Math.max(m, x.position), 0);
    if (await call("/api/admin/payment-methods", { label: newLabel.trim(), position: maxPos + 1 }))
      setNewLabel("");
  }

  async function move(idx: number, dir: -1 | 1) {
    const a = methods[idx];
    const b = methods[idx + dir];
    if (!a || !b) return;
    // Swap positions; two sequential updates are fine at this scale.
    await call(`/api/admin/payment-methods/${a.id}`, { position: b.position });
    await call(`/api/admin/payment-methods/${b.id}`, { position: a.position });
  }

  return (
    <section className="border border-hairline bg-surface p-5">
      <p className="mono mb-1 text-[9px] tracking-[0.16em] text-ink-3 uppercase">
        Payment methods
      </p>
      <p className="mb-4 text-[11px] leading-relaxed text-ink-3">
        Used when recording payments (pending Q-10). Methods are never deleted — deactivating
        hides one from new payments while history keeps its label.
      </p>

      <div className="divide-y divide-hairline border border-hairline">
        {methods.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`flex-1 text-[13px] ${m.is_active ? "text-ink" : "text-ink-4 line-through"}`}>
              {m.label}
            </span>
            <Button variant="outline" size="sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${m.label} up`}>
              ↑
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || i === methods.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${m.label} down`}
            >
              ↓
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => call(`/api/admin/payment-methods/${m.id}`, { isActive: !m.is_active })}
            >
              {m.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        ))}
        {methods.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-ink-3">No methods yet — run the seed or add one.</p>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New method label…"
          className="h-8 w-56 text-[13px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <Button size="sm" variant="outline" disabled={busy || !newLabel.trim()} onClick={add}>
          Add method
        </Button>
      </div>
      {error ? <p className="mt-2 text-[11px] text-warning">{error}</p> : null}
    </section>
  );
}
