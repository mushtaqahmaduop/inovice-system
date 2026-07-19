"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

type Step = "email" | "code";

// This project's recovery email carries the raw 6-digit OTP
// (Supabase's `{{ .Token }}` template variable), not a clickable link, so
// the flow consumes it with verifyOtp(type: "recovery") directly rather
// than depending on a link + /auth/callback round trip. verifyOtp
// establishes the same kind of session exchangeCodeForSession would, so
// /update-password's aal1→aal2 TOTP-challenge handling still applies
// unchanged for admin accounts.
//
// The email step always advances to "code" regardless of whether the
// address matched an account — accounts are admin-provisioned, not
// self-signup (D-19), so confirming/denying an email's existence here is
// an enumeration risk we don't need to take on.
export function ForgotPasswordForm() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "recovery",
    });
    if (error) {
      setError("That code didn’t match or has expired. Request a new one below.");
      setBusy(false);
      return;
    }
    window.location.assign("/update-password");
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          a 6-digit code is on its way — check your inbox (and spam folder).
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <FieldLabel htmlFor="otp-code">Reset code</FieldLabel>
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
          {busy ? "Verifying…" : "Verify code"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-text-tertiary underline-offset-2 hover:underline"
          onClick={() => {
            setStep("email");
            setCode("");
            setError("");
          }}
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="space-y-4">
      {error && <p className="text-sm text-error">{error}</p>}
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset code"}
      </Button>
    </form>
  );
}
