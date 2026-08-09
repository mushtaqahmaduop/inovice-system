"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  UserPlus,
  Download,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LogOut,
  Users,
  UserCheck,
  ShieldCheck,
  Briefcase,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { UserRow } from "./page";
import { InviteUserDialog } from "./invite-user-dialog";
import { UserDetailDrawer } from "./user-detail-drawer";
import { Avatar, RolePill, StatusPill, TwoFactorBadge, fmtLastSeen } from "./user-bits";

const PAGE_SIZE = 10;

// A session counts as live if it exists at all — GoTrue deletes the row on
// sign-out and the query already drops expired ones. This is NOT presence:
// the tile says "with live sessions", not "online now", because nothing in
// this stack tracks whether someone is actually looking at the screen.
function liveSessionUsers(rows: UserRow[]) {
  return rows.filter((r) => r.session_count > 0).length;
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-text-tertiary">
        {icon}
        <span className="text-[11px] font-medium tracking-[0.06em] uppercase">{label}</span>
      </div>
      <p className="mono mt-2 text-[26px] leading-[32px] font-semibold text-foreground">{value}</p>
      {hint ? <p className="text-[12px] text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] cursor-pointer rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] text-foreground outline-none focus-visible:border-primary dark:bg-bg-sunken"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Admin user console (task 2.2, D-18/D-19), rebuilt against the owner's Users
// mockup (2026-08-10): a counts strip, a filter bar over the account table,
// and a docked detail panel carrying role, security actions and the archive
// path. Every action is re-authorized server-side in /api/admin/users/[id] —
// nothing here is trusted, and the disabled states below only mirror rules
// the API enforces independently.
export function UsersManager({ rows, selfId }: { rows: UserRow[]; selfId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [twoFaFilter, setTwoFaFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArchived && r.archived_at) return false;
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "disabled" && r.is_active) return false;
      if (twoFaFilter === "enabled" && !r.totp_enabled) return false;
      if (twoFaFilter === "disabled" && r.totp_enabled) return false;
      if (!q) return true;
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
      );
    });
  }, [rows, query, roleFilter, statusFilter, twoFaFilter, showArchived]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const openUser = openId ? (rows.find((r) => r.id === openId) ?? null) : null;

  const live = rows.filter((r) => !r.archived_at);
  const selectedRows = visible.filter((r) => selected.has(r.id) && r.id !== selfId);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  async function call(id: string, action: string, payload?: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    // Refresh on failure too, not just success: the role select and the
    // switches render straight off the server row, so a rejected change
    // (last remaining admin, say) would otherwise sit on screen showing a
    // value the database never accepted.
    router.refresh();
    if (!res.ok) {
      toast.error(data?.error ?? "That didn't go through.");
      return false;
    }
    return true;
  }

  const ACTION_TOASTS: Record<string, string> = {
    revoke_sessions: "Signed out of every device",
    deactivate: "Account disabled",
    reactivate: "Account enabled",
    archive: "User archived",
    restore: "User restored",
    set_role: "Role updated",
    reset_password: "Password set — hand it over in person",
    update_profile: "Details saved",
  };

  async function drawerAction(action: string, payload?: Record<string, unknown>) {
    if (!openUser) return false;
    if (action === "archive") {
      const ok = await confirm({
        title: `Archive ${openUser.full_name}?`,
        description:
          "The account is disabled, signed out everywhere and hidden from this list. Invoices they issued keep their name. You can restore them later.",
        confirmLabel: "Archive user",
        tone: "danger",
      });
      if (!ok) return false;
    }
    if (action === "deactivate") {
      const ok = await confirm({
        title: `Disable ${openUser.full_name}?`,
        description: "They are signed out immediately and cannot sign back in until re-enabled.",
        confirmLabel: "Disable account",
        tone: "danger",
      });
      if (!ok) return false;
    }
    const ok = await call(openUser.id, action, payload);
    if (ok) {
      const label = ACTION_TOASTS[action];
      if (label) toast.success(label);
      if (action === "require_password_change") {
        toast.success(payload?.required ? "Password change required" : "Requirement cleared");
      }
    }
    return ok;
  }

  async function bulk(action: "revoke_sessions" | "deactivate") {
    const targets = selectedRows;
    if (targets.length === 0) return;
    const ok = await confirm({
      title:
        action === "revoke_sessions"
          ? `Sign out ${targets.length} user${targets.length === 1 ? "" : "s"}?`
          : `Disable ${targets.length} account${targets.length === 1 ? "" : "s"}?`,
      description:
        action === "revoke_sessions"
          ? "Every device for the selected accounts is signed out. They can sign back in."
          : "The selected accounts are signed out and locked until re-enabled.",
      confirmLabel: action === "revoke_sessions" ? "Sign them out" : "Disable accounts",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    let failed = 0;
    for (const t of targets) {
      const res = await fetch(`/api/admin/users/${t.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) failed += 1;
    }
    setBusy(false);
    setSelected(new Set());
    router.refresh();
    if (failed === 0) {
      toast.success(`Done for ${targets.length} user${targets.length === 1 ? "" : "s"}`);
    } else {
      toast.error(`${failed} of ${targets.length} did not go through`);
    }
  }

  // CSV of exactly what is on screen — same rows, same filters. Built in the
  // browser: there is no server-side export to keep in step with it.
  function exportCsv() {
    const header = ["Name", "Email", "Phone", "Role", "Status", "Last sign-in", "2FA", "Sessions"];
    const body = visible.map((r) => [
      r.full_name,
      r.email ?? "",
      r.phone ?? "",
      r.role,
      r.archived_at ? "archived" : r.is_active ? "active" : "disabled",
      r.last_sign_in_at ?? "never",
      r.totp_enabled ? "enabled" : "disabled",
      String(r.session_count),
    ]);
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-start gap-5">
      <div className="min-w-0 flex-1 space-y-5">
        {/* Counts */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <StatTile icon={<Users className="size-4" />} label="Total users" value={live.length} />
          <StatTile
            icon={<UserCheck className="size-4" />}
            label="Active"
            value={live.filter((r) => r.is_active).length}
          />
          <StatTile
            icon={<ShieldCheck className="size-4" />}
            label="Administrators"
            value={live.filter((r) => r.role === "admin").length}
          />
          <StatTile
            icon={<Briefcase className="size-4" />}
            label="Staff"
            value={live.filter((r) => r.role === "staff").length}
          />
          <StatTile
            icon={<Radio className="size-4" />}
            label="Live sessions"
            value={liveSessionUsers(live)}
            hint="accounts signed in somewhere"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-border bg-surface p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or phone…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            label="Filter by role"
            value={roleFilter}
            onChange={(v) => {
              setRoleFilter(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "All roles" },
              { value: "admin", label: "Administrators" },
              { value: "staff", label: "Staff" },
            ]}
          />
          <Select
            label="Filter by status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
          <Select
            label="Filter by two-factor"
            value={twoFaFilter}
            onChange={(v) => {
              setTwoFaFilter(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "All 2FA" },
              { value: "enabled", label: "2FA enabled" },
              { value: "disabled", label: "2FA disabled" },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-secondary">
            <Switch
              checked={showArchived}
              onCheckedChange={(v) => {
                setShowArchived(v);
                setPage(0);
              }}
              aria-label="Show archived users"
            />
            Archived
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download /> Export
          </Button>
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus /> Invite user
          </Button>
        </div>

        {/* Bulk bar */}
        {selectedRows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-primary/30 bg-accent-soft px-4 py-2.5">
            <p className="text-[13px] text-foreground">
              {selectedRows.length} selected
              {selected.has(selfId) ? " (your own account is excluded)" : ""}
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => bulk("revoke_sessions")}
              >
                <LogOut /> Sign out
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => bulk("deactivate")}
              >
                Disable
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {/* Table */}
        <div className="rounded-[12px] border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all users on this page"
                      className="size-3.5 cursor-pointer accent-[var(--accent)]"
                      checked={allOnPageSelected}
                      onChange={(e) => {
                        const next = new Set(selected);
                        pageRows.forEach((r) =>
                          e.target.checked ? next.add(r.id) : next.delete(r.id)
                        );
                        setSelected(next);
                      }}
                    />
                  </th>
                  {["User", "Role", "Status", "Last sign-in", "2FA", "Sessions", ""].map((h, i) => (
                    <th
                      key={h || i}
                      className={`px-4 py-3 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase ${
                        i === 6 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isOpen = r.id === openId;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={`group cursor-pointer border-b border-border last:border-b-0 transition-colors ${
                        isOpen ? "bg-accent-soft" : "hover:bg-bg-sunken"
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.full_name}`}
                          className="size-3.5 cursor-pointer accent-[var(--accent)]"
                          checked={selected.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={r.full_name} />
                          <div className="min-w-0">
                            <p
                              className={`flex items-center gap-2 truncate text-[14px] font-semibold ${
                                r.is_active ? "text-foreground" : "text-text-tertiary"
                              }`}
                            >
                              {r.full_name}
                              {r.id === selfId ? (
                                <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-normal text-primary">
                                  You
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-[12px] text-text-tertiary">
                              {r.email ?? "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RolePill role={r.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill active={r.is_active} archived={r.archived_at !== null} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="mono text-[12px] text-text-secondary">
                          {fmtLastSeen(r.last_sign_in_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TwoFactorBadge enabled={r.totp_enabled} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="mono text-[12px] text-text-secondary">
                          {r.session_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Manage ${r.full_name}`}
                          title="Manage"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(r.id);
                          }}
                        >
                          <SlidersHorizontal />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center">
                      <p className="text-[15px] font-medium text-foreground">No users match</p>
                      <p className="mt-1 text-[13px] text-text-secondary">
                        {rows.length === 0
                          ? "Invite the first account to get started."
                          : "Try a different search or clear the filters."}
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {visible.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3">
              <p className="text-[13px] text-text-secondary">
                Showing {current * PAGE_SIZE + 1}–{Math.min(visible.length, (current + 1) * PAGE_SIZE)}{" "}
                of {visible.length} user{visible.length === 1 ? "" : "s"}
              </p>
              {pageCount > 1 ? (
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={current <= 0}
                    onClick={() => setPage(current - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft />
                  </Button>
                  {Array.from({ length: pageCount }, (_, i) => i).map((p) => (
                    <Button
                      key={p}
                      variant={p === current ? "default" : "outline"}
                      size="icon-sm"
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p + 1}`}
                      aria-current={p === current ? "page" : undefined}
                      className="mono"
                    >
                      {p + 1}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={current >= pageCount - 1}
                    onClick={() => setPage(current + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {openUser ? (
        <UserDetailDrawer
          user={openUser}
          isSelf={openUser.id === selfId}
          busy={busy}
          onClose={() => setOpenId(null)}
          onAction={drawerAction}
        />
      ) : null}

      {inviting ? (
        <InviteUserDialog
          onClose={() => setInviting(false)}
          onCreated={({ email }) => {
            setInviting(false);
            router.refresh();
            toast.success(`Account created for ${email}. Share the password in person.`);
          }}
        />
      ) : null}
    </div>
  );
}
