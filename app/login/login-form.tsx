"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

type Step = "password" | "totp" | "recovery";

const REASON_MESSAGES: Record<string, string> = {
  inactive: "This account has been deactivated.",
  "reset-link-invalid": "That reset link is invalid or has expired. Request a new one below.",
};

// Two-step login: password, then — when the account has an enrolled TOTP
// factor — the code challenge. Arriving with ?mfa=1 (middleware redirect for
// an aal1 session) jumps straight to the challenge. The recovery branch
// consumes a one-time code and routes back through /mfa-setup.
export function LoginForm({ startAtMfa, reason }: { startAtMfa: boolean; reason?: string }) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>(startAtMfa ? "totp" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(reason ? (REASON_MESSAGES[reason] ?? "") : "");
  const [busy, setBusy] = useState(false);
  // Reveal the password (owner request 2026-07-30) — typo-proofing at the
  // counter. Resets to hidden whenever the step changes so a revealed password
  // is never left on screen behind the MFA challenge.
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setError((e) => (step === "password" ? e : ""));
    setCode("");
    setShowPassword(false);
  }, [step]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid email or password.");
      setBusy(false);
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      setStep("totp");
      setBusy(false);
      return;
    }
    // No factor enrolled — middleware decides where this session may go
    // (admins land on /mfa-setup, staff on the dashboard).
    window.location.assign("/dashboard");
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
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
      factorId: totp.id,
    });
    if (cErr || !challenge) {
      setError(cErr?.message ?? "Could not start the challenge.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) {
      setError("That code didn’t match. Codes rotate every 30 seconds — try the current one.");
      setBusy(false);
      return;
    }
    window.location.assign("/dashboard");
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/recover-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Recovery failed.");
      setBusy(false);
      return;
    }
    // Factor removed — middleware now routes this admin to /mfa-setup.
    window.location.assign("/mfa-setup");
  }

  if (step === "password") {
    return (
      <form
        onSubmit={submitPassword}
        aria-busy={busy || undefined}
        className={`space-y-4 ${busy ? "cursor-wait" : ""}`}
      >
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[8px] text-text-tertiary transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <a
          href="/forgot-password"
          className="block text-center text-xs text-text-tertiary underline-offset-2 hover:underline"
        >
          Forgot password?
        </a>
      </form>
    );
  }

  const isRecovery = step === "recovery";
  return (
    <form
      onSubmit={isRecovery ? submitRecovery : submitTotp}
      aria-busy={busy || undefined}
      className={`space-y-4 ${busy ? "cursor-wait" : ""}`}
    >
      <p className="text-sm leading-relaxed text-text-secondary">
        {isRecovery
          ? "Enter one of your saved recovery codes. It will be consumed, and you will re-enroll a new authenticator."
          : "Enter the 6-digit code from your authenticator app."}
      </p>
      {error && <p className="text-sm text-error">{error}</p>}
      <div>
        <FieldLabel htmlFor="otp-code">
          {isRecovery ? "Recovery code" : "Authenticator code"}
        </FieldLabel>
        <Input
          id="otp-code"
          className={
            isRecovery
              ? "mono tracking-[0.2em]"
              : "mono h-11 text-center text-[20px] tracking-[0.45em]"
          }
          inputMode={isRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={isRecovery ? 20 : 6}
          placeholder={isRecovery ? "XXXX-XXXX-XX" : "000000"}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" loading={busy}>
        {busy ? "Verifying…" : isRecovery ? "Use recovery code" : "Verify"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-text-tertiary underline-offset-2 hover:underline"
        onClick={() => setStep(isRecovery ? "totp" : "recovery")}
      >
        {isRecovery ? "Back to authenticator code" : "Lost your authenticator? Use a recovery code"}
      </button>
    </form>
  );
}
