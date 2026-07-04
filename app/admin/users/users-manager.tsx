"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline-strong text-left">
            <th className="mono py-2 pr-4 text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">
              Name
            </th>
            <th className="mono py-2 pr-4 text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">
              Role
            </th>
            <th className="mono py-2 pr-4 text-[10px] font-medium tracking-[0.12em] text-ink-3 uppercase">
              Status
            </th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} className="border-b border-hairline">
              <td className="py-2.5 pr-4 text-ink">
                {p.full_name}
                {p.id === selfId && <span className="ml-2 text-[11px] text-ink-3">(you)</span>}
              </td>
              <td className="mono py-2.5 pr-4 text-[11px] tracking-wide text-ink-2 uppercase">
                {p.role}
              </td>
              <td className="py-2.5 pr-4">
                {p.is_active ? (
                  <span className="text-success">active</span>
                ) : (
                  <span className="text-ink-3">deactivated</span>
                )}
              </td>
              <td className="py-2.5 text-right">
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

      <form onSubmit={createUser} className="max-w-sm space-y-3 border-t border-hairline pt-6">
        <p className="mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">New account</p>
        <Input
          aria-label="Full name"
          placeholder="Full name"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <Input
          aria-label="Email"
          type="email"
          placeholder="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          aria-label="Initial password"
          type="text"
          placeholder="Initial password (share in person; min 10 chars)"
          required
          minLength={10}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          aria-label="Role"
          className="h-9 w-full border border-input bg-surface px-2.5 text-sm text-ink"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin (requires TOTP at first sign-in)</option>
        </select>
        <Button type="submit" disabled={busy}>
          {busy ? "Working…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
