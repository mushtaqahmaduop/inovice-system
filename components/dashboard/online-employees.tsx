"use client";

import { usePresence } from "@/components/shell/presence-provider";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Admin-only (gated by the dashboard page, not here) — live roster from
// PresenceProvider's Realtime Presence channel. No polling, no table: a
// person appears the instant their browser tab opens the app and
// disappears the instant their socket disconnects (tab close, sign-out).
export function OnlineEmployees() {
  const people = usePresence();
  const sorted = [...people].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <section className="rounded-[14px] border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground">Online Now</h2>
        <span className="mono text-[12px] text-text-tertiary">{sorted.length}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-secondary">No one else is online.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((p) => (
            <li key={p.userId} className="flex items-center gap-3">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
                {initials(p.fullName)}
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-success"
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {p.fullName}
                </span>
                <span className="block text-[11px] text-text-tertiary capitalize">{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
