"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

type Step = "password" | "totp" | "done";

// Admin accounts carry mandatory TOTP (CLAUDE.md §2); Supabase enforces
// aal2 for auth.updateUser on those accounts even inside a valid recovery
// session, so a second-factor challenge is threaded in here before the
// password write is retried. Staff accounts (no MFA) go straight to "done".
export function UpdatePasswordForm() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function applyPassword() {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setStep("done");
      return;
    }
    if (error.code === "insufficient_aal" || /aal2/i.test(error.message)) {
      setStep("totp");
      return;
    }
    setError(error.message);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    await applyPassword();
    setBusy(false);
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (fErr || !totp) {
      setError("No authenticator found for this account.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: totp.id,
      code: code.trim(),
    });
    if (vErr) {
      setError("That code didn’t match. Try the current one.");
      setBusy(false);
      return;
    }
    await applyPassword();
    setBusy(false);
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          Your password has been updated.
        </p>
        <Button className="w-full" onClick={() => window.location.assign("/dashboard")}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === "totp") {
    return (
      <form onSubmit={submitTotp} className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          Enter the 6-digit code from your authenticator app to confirm this change.
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <FieldLabel htmlFor="otp-code">Authenticator code</FieldLabel>
          <Input
            id="otp-code"
            className="mono h-11 text-center text-[20px] tracking-[0.45em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Verifying…" : "Verify & update password"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      {error && <p className="text-sm text-error">{error}</p>}
      <div>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
