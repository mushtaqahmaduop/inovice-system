"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldLabel, FieldHint } from "@/components/ui/field";

// Password suggestion: three short words plus digits. Long enough to satisfy
// the 10-character floor, still short enough to read down a phone line, and
// generated in the browser purely as a convenience — the admin can overwrite
// it, and the server validates length regardless.
const WORDS = [
  "harbour",
  "lantern",
  "marble",
  "compass",
  "falcon",
  "cedar",
  "amber",
  "quartz",
  "meridian",
  "saffron",
];

function suggestPassword() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${pick()}-${pick()}-${digits}`;
}

export type InviteResult = { email: string };

export function InviteUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: InviteResult) => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: suggestPassword(),
    role: "staff",
    requirePasswordChange: true,
  });
  const [showPassword, setShowPassword] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Could not create the account.");
      return;
    }
    onCreated({ email: form.email });
  }

  return (
    <Modal
      title="Invite user"
      description="Creates the account immediately. There is no email step yet — hand the password over in person."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <p className="text-[13px] text-error">{error}</p> : null}

        <div>
          <FieldLabel htmlFor="inv-name">Full name</FieldLabel>
          <Input
            id="inv-name"
            required
            autoFocus
            placeholder="Enter full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </div>

        <div>
          <FieldLabel htmlFor="inv-email">Email</FieldLabel>
          <Input
            id="inv-email"
            type="email"
            required
            placeholder="name@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <FieldHint>This is the sign-in name and cannot be changed here later.</FieldHint>
        </div>

        <div>
          <FieldLabel htmlFor="inv-phone">Phone (optional)</FieldLabel>
          <Input
            id="inv-phone"
            className="mono"
            placeholder="+971 50 000 0000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        <div>
          <FieldLabel htmlFor="inv-password">Initial password</FieldLabel>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="inv-password"
                className="mono pr-9"
                type={showPassword ? "text" : "password"}
                required
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-text-tertiary hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Suggest another password"
              title="Suggest another password"
              onClick={() => setForm({ ...form, password: suggestPassword() })}
            >
              <RefreshCw />
            </Button>
          </div>
          <FieldHint>Minimum 10 characters.</FieldHint>
        </div>

        <div>
          <FieldLabel htmlFor="inv-role">Role</FieldLabel>
          <select
            id="inv-role"
            className="h-[38px] w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[14px] text-foreground transition-colors outline-none focus-visible:border-primary focus-visible:shadow-[var(--shadow-focus)] dark:bg-bg-sunken"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="staff">Staff</option>
            <option value="admin">Administrator</option>
          </select>
          <FieldHint>
            {form.role === "admin"
              ? "Admins must enroll an authenticator app before they can reach any screen."
              : "Staff cannot manage users, change settings, void invoices or delete anything."}
          </FieldHint>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-[12px] border border-border bg-bg-sunken px-4 py-3">
          <div>
            <p className="text-[14px] font-medium text-foreground">Require a password change</p>
            <p className="mt-0.5 text-[13px] leading-[19px] text-text-secondary">
              They must set their own password before reaching the app.
            </p>
          </div>
          <Switch
            checked={form.requirePasswordChange}
            onCheckedChange={(v) => setForm({ ...form, requirePasswordChange: v })}
            aria-label="Require a password change at first sign-in"
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Create account
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
