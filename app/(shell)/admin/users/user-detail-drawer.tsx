"use client";

import { useEffect, useState } from "react";
import {
  X,
  Mail,
  Phone,
  Clock,
  CalendarDays,
  KeyRound,
  ShieldCheck,
  UserCog,
  LogOut,
  Check,
  Minus,
  Monitor,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field";
import type { UserRow } from "./page";
import {
  Avatar,
  RolePill,
  StatusPill,
  TwoFactorBadge,
  describeDevice,
  fmtDateTime,
  fmtLastSeen,
} from "./user-bits";

type Tab = "overview" | "permissions" | "sessions" | "activity";

type SessionRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  aal: string | null;
  user_agent: string | null;
  ip: string | null;
};
type ActivityRow = {
  id: string;
  event_type: string;
  created_at: string;
  invoice_number: string | null;
};

// What each role can actually do, read off the RLS policies in migration 0007
// and CLAUDE.md §4 — not a wish list. Permissions here are ROLE-derived: this
// system has no per-user overrides, and inventing a row of toggles that only
// pretend to grant something would be worse than showing the truth plainly.
const CAPABILITIES: { label: string; admin: boolean; staff: boolean }[] = [
  { label: "Create and edit draft invoices", admin: true, staff: true },
  { label: "Issue (seal) an invoice", admin: true, staff: true },
  { label: "Delete a draft", admin: true, staff: true },
  { label: "Record payments", admin: true, staff: true },
  { label: "Add and edit customers", admin: true, staff: true },
  { label: "Remove a customer", admin: true, staff: false },
  { label: "Manage services and prices", admin: true, staff: false },
  { label: "Manage payment methods", admin: true, staff: false },
  { label: "Void or credit a sealed invoice", admin: true, staff: false },
  { label: "Company settings, VAT and numbering", admin: true, staff: false },
  { label: "Manage users and sessions", admin: true, staff: false },
  { label: "Data exports", admin: true, staff: false },
];

const EVENT_LABELS: Record<string, string> = {
  created: "Created a draft",
  draft_updated: "Edited a draft",
  issued: "Issued an invoice",
  payment_recorded: "Recorded a payment",
  payment_reversed: "Reversed a payment",
  voided: "Voided an invoice",
  printed: "Printed",
  emailed: "Emailed",
};

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="flex items-center gap-2.5 text-[13px] text-text-secondary">
        <span className="text-text-tertiary">{icon}</span>
        {label}
      </span>
      <span className="min-w-0 text-right text-[13px] text-foreground">{children}</span>
    </div>
  );
}

export function UserDetailDrawer({
  user,
  isSelf,
  busy,
  onClose,
  onAction,
}: {
  user: UserRow;
  isSelf: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [detail, setDetail] = useState<{
    sessions: SessionRow[];
    activity: ActivityRow[];
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ fullName: user.full_name, phone: user.phone ?? "" });
  const [newPassword, setNewPassword] = useState("");
  const [showReset, setShowReset] = useState(false);

  // Esc closes, matching the invoice preview drawer (§5.8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Sessions and activity are per-user and change constantly, so they load
  // when the drawer opens rather than riding along with every list render.
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setEditing(false);
    setShowReset(false);
    setNewPassword("");
    setDraft({ fullName: user.full_name, phone: user.phone ?? "" });
    fetch(`/api/admin/users/${user.id}`)
      .then((r) => (r.ok ? r.json() : { sessions: [], activity: [] }))
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail({ sessions: [], activity: [] }));
    return () => {
      cancelled = true;
    };
  }, [user.id, user.full_name, user.phone]);

  const archived = user.archived_at !== null;

  return (
    <>
      {/* Backdrop only below xl — on a wide screen the panel is docked beside
          the table, so dimming the list you are working against is wrong. */}
      <div
        className="fixed inset-0 z-40 bg-foreground/20 supports-backdrop-filter:backdrop-blur-xs xl:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label={`Details for ${user.full_name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l border-border bg-surface shadow-[var(--shadow-drawer)] xl:sticky xl:top-5 xl:z-0 xl:h-[calc(100dvh-2.5rem)] xl:w-[380px] xl:shrink-0 xl:rounded-[14px] xl:border xl:shadow-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-foreground">User details</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Identity */}
          <div className="flex items-center gap-3 px-5 py-4">
            <Avatar name={user.full_name} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">
                {user.full_name}
                {isSelf ? (
                  <span className="ml-2 text-[12px] font-normal text-primary">you</span>
                ) : null}
              </p>
              <p className="truncate text-[13px] text-text-secondary">{user.email ?? "—"}</p>
              <div className="mt-1.5">
                <StatusPill active={user.is_active} archived={archived} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="User detail sections"
            className="flex gap-4 border-b border-border px-5"
          >
            {(["overview", "permissions", "sessions", "activity"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-[13px] capitalize transition-colors ${
                  tab === t
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-text-secondary hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="px-5 py-3">
              {editing ? (
                <div className="space-y-3 pb-3">
                  <div>
                    <FieldLabel htmlFor="d-name">Full name</FieldLabel>
                    <Input
                      id="d-name"
                      value={draft.fullName}
                      onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="d-phone">Phone</FieldLabel>
                    <Input
                      id="d-phone"
                      className="mono"
                      placeholder="+971 50 000 0000"
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={async () => {
                        const ok = await onAction("update_profile", {
                          fullName: draft.fullName,
                          phone: draft.phone,
                        });
                        if (ok) setEditing(false);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="divide-y divide-border">
                <Row icon={<UserCog className="size-4" />} label="Role">
                  <select
                    className="cursor-pointer rounded-[8px] border border-border-strong bg-surface px-2 py-1 text-[13px] text-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 dark:bg-bg-sunken"
                    value={user.role}
                    disabled={busy || isSelf || archived}
                    title={isSelf ? "You cannot change your own role." : undefined}
                    onChange={(e) => onAction("set_role", { role: e.target.value })}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Administrator</option>
                  </select>
                </Row>
                <Row icon={<Mail className="size-4" />} label="Email">
                  <span className="break-all">{user.email ?? "—"}</span>
                </Row>
                <Row icon={<Phone className="size-4" />} label="Phone">
                  <span className="mono">{user.phone ?? "—"}</span>
                </Row>
                <Row icon={<Clock className="size-4" />} label="Last sign-in">
                  {fmtLastSeen(user.last_sign_in_at)}
                </Row>
                <Row icon={<CalendarDays className="size-4" />} label="Created">
                  {fmtDateTime(user.created_at)}
                </Row>
                <Row icon={<ShieldCheck className="size-4" />} label="Two-factor">
                  <TwoFactorBadge enabled={user.totp_enabled} />
                </Row>
                <Row icon={<KeyRound className="size-4" />} label="Password">
                  {user.must_change_password ? (
                    <span className="text-text-secondary">Change required</span>
                  ) : (
                    <span className="text-text-tertiary">Set by the user</span>
                  )}
                </Row>
              </div>

              {!editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={archived}
                  onClick={() => setEditing(true)}
                >
                  Edit name & phone
                </Button>
              ) : null}

              {/* Security actions */}
              <h3 className="mt-6 mb-1 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                Security
              </h3>
              <div className="space-y-2">
                {showReset ? (
                  <div className="rounded-[12px] border border-border bg-bg-sunken p-3">
                    <FieldLabel htmlFor="d-pass">New password</FieldLabel>
                    <Input
                      id="d-pass"
                      className="mono"
                      autoFocus
                      minLength={10}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 10 characters"
                    />
                    <p className="mt-1.5 text-[12px] leading-[17px] text-text-secondary">
                      Signs every device out and requires them to set their own password next time.
                      Hand this one over in person.
                    </p>
                    <div className="mt-2.5 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowReset(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={busy}
                        disabled={newPassword.length < 10}
                        onClick={async () => {
                          const ok = await onAction("reset_password", {
                            password: newPassword,
                          });
                          if (ok) {
                            setShowReset(false);
                            setNewPassword("");
                          }
                        }}
                      >
                        Set password
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    disabled={busy || archived}
                    onClick={() => setShowReset(true)}
                  >
                    Reset password <KeyRound />
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  disabled={busy || (detail?.sessions.length === 0 && detail !== null)}
                  onClick={() => onAction("revoke_sessions")}
                >
                  Force sign out <LogOut />
                </Button>

                <div className="flex items-center justify-between gap-4 rounded-[12px] border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      Require password change
                    </p>
                    <p className="text-[12px] leading-[17px] text-text-secondary">
                      Locked to the reset form until they set a new one.
                    </p>
                  </div>
                  <Switch
                    checked={user.must_change_password}
                    disabled={busy || isSelf || archived}
                    aria-label="Require a password change"
                    onCheckedChange={(v) => onAction("require_password_change", { required: v })}
                  />
                </div>
              </div>

              {/* Danger zone */}
              {!isSelf ? (
                <>
                  <h3 className="mt-6 mb-1 text-[11px] font-medium tracking-[0.06em] text-error uppercase">
                    Danger zone
                  </h3>
                  <div className="space-y-2 rounded-[12px] border border-error/25 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">
                          {user.is_active ? "Account is active" : "Account is disabled"}
                        </p>
                        <p className="text-[12px] leading-[17px] text-text-secondary">
                          Disabling signs them out everywhere immediately.
                        </p>
                      </div>
                      <Switch
                        checked={user.is_active}
                        disabled={busy || archived}
                        aria-label="Account active"
                        onCheckedChange={(v) => onAction(v ? "reactivate" : "deactivate")}
                      />
                    </div>
                    {archived ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        loading={busy}
                        onClick={() => onAction("restore")}
                      >
                        Restore user <ArchiveRestore />
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full justify-between"
                        loading={busy}
                        onClick={() => onAction("archive")}
                      >
                        Archive user <Archive />
                      </Button>
                    )}
                    <p className="text-[12px] leading-[17px] text-text-secondary">
                      Archiving disables the account and hides it from this list. The record itself
                      stays, because sealed invoices name the person who issued them and that has to
                      keep resolving for five years.
                    </p>
                  </div>
                </>
              ) : null}
              <div className="h-4" />
            </div>
          ) : null}

          {tab === "permissions" ? (
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center gap-2">
                <RolePill role={user.role} />
                <span className="text-[13px] text-text-secondary">
                  {user.role === "admin" ? "Full access" : "Day-to-day counter work"}
                </span>
              </div>
              <p className="mb-3 text-[12px] leading-[17px] text-text-secondary">
                Permissions follow the role — there are no per-user exceptions. Change the role on
                the Overview tab to change what this person can do.
              </p>
              <ul className="divide-y divide-border">
                {CAPABILITIES.map((c) => {
                  const allowed = user.role === "admin" ? c.admin : c.staff;
                  return (
                    <li key={c.label} className="flex items-center gap-2.5 py-2">
                      {allowed ? (
                        <Check className="size-4 shrink-0 text-success" />
                      ) : (
                        <Minus className="size-4 shrink-0 text-text-tertiary" />
                      )}
                      <span
                        className={`text-[13px] ${allowed ? "text-foreground" : "text-text-tertiary"}`}
                      >
                        {c.label}
                      </span>
                    </li>
                  );
                })}
                <li className="flex items-center gap-2.5 py-2">
                  <ShieldCheck className="size-4 shrink-0 text-text-tertiary" />
                  <span className="text-[13px] text-text-secondary">
                    {user.role === "admin"
                      ? "Two-factor authentication is mandatory"
                      : "Two-factor authentication is not required"}
                  </span>
                </li>
              </ul>
            </div>
          ) : null}

          {tab === "sessions" ? (
            <div className="px-5 py-4">
              {detail === null ? (
                <p className="text-[13px] text-text-tertiary">Loading sessions…</p>
              ) : detail.sessions.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  No live sessions — this account is signed out everywhere.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.sessions.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 py-3">
                      <Monitor className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground">
                          {describeDevice(s.user_agent)}
                          {s.aal === "aal2" ? (
                            <span className="ml-2 text-[12px] font-normal text-success">
                              2FA verified
                            </span>
                          ) : null}
                        </p>
                        <p className="mono text-[12px] text-text-tertiary">{s.ip ?? "no IP"}</p>
                        <p className="text-[12px] text-text-secondary">
                          Started {fmtLastSeen(s.created_at)} · last used{" "}
                          {fmtLastSeen(s.updated_at ?? s.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {detail !== null && detail.sessions.length > 0 ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-3 w-full"
                  loading={busy}
                  onClick={() => onAction("revoke_sessions")}
                >
                  Sign out of all {detail.sessions.length} session
                  {detail.sessions.length === 1 ? "" : "s"}
                </Button>
              ) : null}
            </div>
          ) : null}

          {tab === "activity" ? (
            <div className="px-5 py-4">
              {detail === null ? (
                <p className="text-[13px] text-text-tertiary">Loading activity…</p>
              ) : detail.activity.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  Nothing recorded yet. Invoice actions appear here as they happen.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] text-foreground">
                          {EVENT_LABELS[a.event_type] ?? a.event_type}
                        </p>
                        {a.invoice_number ? (
                          <p className="mono text-[12px] text-text-tertiary">{a.invoice_number}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[12px] text-text-tertiary">
                        {fmtLastSeen(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
