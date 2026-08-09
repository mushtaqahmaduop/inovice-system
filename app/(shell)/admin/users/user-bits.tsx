"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";

// Shared atoms for the admin user console. They live in their own file so the
// list and the detail drawer can both use them without importing each other.

const TZ = "Asia/Dubai";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// "2 Jan 2026, 10:30 AM" in the shop's timezone. The server clock is UTC on
// Vercel, so every date on this screen is converted explicitly — an admin
// reading "last login 9:45 PM" needs it to be 9:45 PM in Dubai.
export function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
}

function dubaiDayKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

// Table-column form: "Today, 12:40 PM" / "Yesterday, 9:30 PM" / "3 days ago"
// / "2 Jan 2026". Never "Never logged in" dressed up as a date — an account
// that has not been used says so.
export function fmtLastSeen(iso: string | null) {
  if (!iso) return "Never";
  const then = new Date(iso);
  const now = new Date();
  const time = then.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });

  const dayMs = 86_400_000;
  const todayKey = dubaiDayKey(now);
  const yesterdayKey = dubaiDayKey(new Date(now.getTime() - dayMs));
  const thenKey = dubaiDayKey(then);

  if (thenKey === todayKey) return `Today, ${time}`;
  if (thenKey === yesterdayKey) return `Yesterday, ${time}`;

  const days = Math.round((now.getTime() - then.getTime()) / dayMs);
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

// Enough of the UA string to tell one of your own sessions from a stranger's.
// Deliberately coarse: this is a "which machine is that" hint, not device
// fingerprinting, and a wrong-but-confident label would be worse than a vague
// one.
export function describeDevice(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-primary"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
    >
      {initials(name)}
    </span>
  );
}

// Soft background + strong text, never a solid fill (§2.3).
export function RolePill({ role }: { role: string }) {
  return (
    <span
      className={
        role === "admin"
          ? "inline-flex rounded-full border border-primary/20 bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-primary"
          : "inline-flex rounded-full border border-border bg-neutral-soft px-2.5 py-0.5 text-[12px] font-medium text-text-secondary"
      }
    >
      {role === "admin" ? "Administrator" : "Staff"}
    </span>
  );
}

export function StatusPill({ active, archived }: { active: boolean; archived: boolean }) {
  const label = archived ? "Archived" : active ? "Active" : "Disabled";
  const tone = archived
    ? "border-border bg-neutral-soft text-text-tertiary"
    : active
      ? "border-success/20 bg-success-soft text-success"
      : "border-error/20 bg-neutral-soft text-error";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${tone}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          archived ? "bg-text-tertiary" : active ? "bg-success" : "bg-error"
        }`}
      />
      {label}
    </span>
  );
}

export function TwoFactorBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] ${
        enabled ? "text-success" : "text-text-tertiary"
      }`}
    >
      {enabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}
