"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { FieldLabel, FieldHint } from "@/components/ui/field";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const PAGE_SIZE = 10;

// User management (task 2.2, D-18/D-19), rebuilt for the Cool White /
// Federal Blue system against the owner's Users mockup: New-account card on
// top, then an "Accounts & sessions" table with avatars, role pills, status
// dots, and pagination. Every action is re-authorized server-side.
export function UsersManager({ profiles, selfId }: { profiles: Profile[]; selfId: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "staff" });
  const [showPassword, setShowPassword] = useState(false);
  const [page, setPage] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  async function call(path: string, body: unknown) {
    setBusy(true);
    setNotice("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Request failed.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/admin/users", form)) {
      setNotice(`Account created for ${form.email}. Share the initial password in person.`);
      setForm({ fullName: "", email: "", password: "", role: "staff" });
    }
  }

  const pageCount = Math.max(1, Math.ceil(profiles.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageRows = profiles.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {notice && <p className="text-[13px] text-success">{notice}</p>}

      {/* New account */}
      <form
        onSubmit={createUser}
        className="rounded-[14px] border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      >
        <h2 className="mb-4 text-[15px] font-semibold text-foreground">New account</h2>
        <div className="grid gap-4 lg:grid-cols-4">
          <div>
            <FieldLabel htmlFor="u-name">Full name</FieldLabel>
            <Input
              id="u-name"
              ref={nameRef}
              required
              placeholder="Enter full name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="u-email">Email</FieldLabel>
            <Input
              id="u-email"
              type="email"
              required
              placeholder="Enter email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="u-password">Initial password</FieldLabel>
            <div className="relative">
              <Input
                id="u-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={10}
                placeholder="Enter initial password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-text-tertiary hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldHint>Share in person; minimum 10 characters.</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor="u-role">Role</FieldLabel>
            <select
              id="u-role"
              className="h-[38px] w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[14px] text-foreground transition-colors outline-none focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <FieldHint>Admins must enroll TOTP on first sign-in.</FieldHint>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : "Create account"}
          </Button>
        </div>
      </form>

      {/* Accounts & sessions */}
      <div className="rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-foreground">Accounts &amp; sessions</h2>
          <Button size="sm" onClick={() => nameRef.current?.focus()}>
            <Plus /> New account
          </Button>
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                  Status
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium tracking-[0.06em] text-text-tertiary uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-primary">
                        {initials(p.full_name)}
                      </span>
                      <span
                        className={`text-[14px] font-semibold ${p.is_active ? "text-foreground" : "text-text-tertiary"}`}
                      >
                        {p.full_name}
                        {p.id === selfId ? (
                          <span className="ml-2 text-[12px] font-normal text-primary">(you)</span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.role === "admin"
                          ? "inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-primary"
                          : "inline-flex rounded-full bg-neutral-soft px-2.5 py-0.5 text-[12px] font-medium text-text-secondary"
                      }
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary">
                      <span
                        className={`size-1.5 rounded-full ${p.is_active ? "bg-success" : "bg-text-tertiary"}`}
                      />
                      {p.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !p.is_active}
                        onClick={() =>
                          call(`/api/admin/users/${p.id}`, { action: "revoke_sessions" }).then(
                            (ok) =>
                              ok && setNotice(`All sessions for ${p.full_name} were signed out.`)
                          )
                        }
                      >
                        Sign out everywhere
                      </Button>
                      {p.id !== selfId &&
                        (p.is_active ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              call(`/api/admin/users/${p.id}`, { action: "deactivate" }).then(
                                (ok) => ok && toast.success(`${p.full_name} deactivated`)
                              )
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              call(`/api/admin/users/${p.id}`, { action: "reactivate" }).then(
                                (ok) => ok && toast.success(`${p.full_name} reactivated`)
                              )
                            }
                          >
                            Reactivate
                          </Button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-[13px] text-text-secondary"
                  >
                    No accounts on the register — create the first one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {profiles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3">
            <p className="text-[13px] text-text-secondary">
              Showing {current * PAGE_SIZE + 1}–
              {Math.min(profiles.length, (current + 1) * PAGE_SIZE)} of {profiles.length} users
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
  );
}
