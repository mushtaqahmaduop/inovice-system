"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel, FieldHint } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/status-chip";

type Profile = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

// Plain table for now — TanStack Table arrives with the data-heavy views
// (2.3/4.3). Every action here is re-authorized server-side by the API.
export function UsersManager({ profiles, selfId }: { profiles: Profile[]; selfId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "staff" });

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Request failed.");
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

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-warning">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div className="overflow-x-auto border border-hairline bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-2 text-left">
              <th className="mono px-3 py-2.5 text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase">
                Name
              </th>
              <th className="mono px-3 py-2.5 text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase">
                Role
              </th>
              <th className="mono px-3 py-2.5 text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase">
                Status
              </th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="h-[42px] border-b border-hairline last:border-b-0">
                <td className={`px-3 py-2.5 ${p.is_active ? "text-ink" : "text-ink-3"}`}>
                  {p.full_name}
                  {p.id === selfId && <span className="ml-2 text-[11px] text-ink-3">(you)</span>}
                </td>
                <td className="px-3 py-2.5">
                  <StatusChip variant={p.role === "admin" ? "ink" : "neutral"}>{p.role}</StatusChip>
                </td>
                <td className="px-3 py-2.5">
                  {p.is_active ? (
                    <StatusChip variant="ink">active</StatusChip>
                  ) : (
                    <StatusChip variant="neutral">deactivated</StatusChip>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                <div className="inline-flex gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={busy || !p.is_active}
                    onClick={() =>
                      call(`/api/admin/users/${p.id}`, { action: "revoke_sessions" }).then(
                        (ok) => ok && setNotice(`All sessions for ${p.full_name} were signed out.`)
                      )
                    }
                  >
                    Sign out everywhere
                  </Button>
                  {p.id !== selfId &&
                    (p.is_active ? (
                      <Button
                        variant="destructive"
                        size="xs"
                        disabled={busy}
                        onClick={() => call(`/api/admin/users/${p.id}`, { action: "deactivate" })}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        onClick={() => call(`/api/admin/users/${p.id}`, { action: "reactivate" })}
                      >
                        Reactivate
                      </Button>
                    ))}
                </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={createUser}
        className="max-w-md space-y-4 border border-hairline bg-surface p-6"
      >
        <p className="mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">New account</p>
        <div>
          <FieldLabel htmlFor="u-name">Full name</FieldLabel>
          <Input
            id="u-name"
            required
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
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <FieldLabel htmlFor="u-password">Initial password</FieldLabel>
          <Input
            id="u-password"
            type="text"
            required
            minLength={10}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <FieldHint>Share in person; minimum 10 characters.</FieldHint>
        </div>
        <div>
          <FieldLabel htmlFor="u-role">Role</FieldLabel>
          <select
            id="u-role"
            className="h-9 w-full border border-input bg-surface px-2.5 text-sm text-ink transition-colors outline-none focus-visible:border-ring focus-visible:shadow-[var(--shadow-focus)]"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin (requires TOTP at first sign-in)</option>
          </select>
          <FieldHint>Admins must enroll TOTP on first sign-in.</FieldHint>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Working…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
