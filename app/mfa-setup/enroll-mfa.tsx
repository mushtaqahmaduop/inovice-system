"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Phase = "loading" | "scan" | "codes" | "error";

// TOTP enrollment (R-9.2 setup page) → immediately followed by one-time
// recovery codes [#24]. The user cannot finish without passing through the
// codes screen; whether they actually save them is theirs to own — we surface
// that as loudly as a screen can.
export function EnrollMfa() {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // A previous abandoned attempt leaves an unverified factor behind —
      // clear it so enroll() starts clean.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (error || !data) {
        setError(error?.message ?? "Could not start enrollment.");
        setPhase("error");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setPhase("scan");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setError(cErr?.message ?? "Could not create a challenge.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) {
      setError("That code didn’t match — scan the QR again or wait for the next code.");
      setBusy(false);
      return;
    }
    // Session is aal2 now — mint the recovery codes.
    const res = await fetch("/api/auth/recovery-codes", { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.codes) {
      setError(body?.error ?? "Enrolled, but recovery codes failed — retry from this page.");
      setBusy(false);
      return;
    }
    setRecoveryCodes(body.codes);
    setPhase("codes");
    setBusy(false);
  }

  if (phase === "loading")
    return <p className="text-sm text-text-tertiary">Preparing enrollment…</p>;
  if (phase === "error") return <p className="text-sm text-danger">{error}</p>;

  if (phase === "codes") {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          Authenticator enrolled. These <strong>one-time recovery codes</strong> are shown{" "}
          <strong>only now</strong>. Print them or store them in a password manager — a lost
          authenticator without a recovery code means a manual operator recovery.
        </p>
        <div className="mono grid grid-cols-2 gap-x-6 gap-y-1.5 border border-border bg-background p-4 text-[13px] tracking-wider text-foreground">
          {recoveryCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button className="w-full" onClick={() => window.location.assign("/dashboard")}>
          I have saved my recovery codes — continue
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then
        enter the 6-digit code it shows.
      </p>
      {qr && (
        // Supabase returns the QR as an SVG data URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="TOTP enrollment QR code" className="mx-auto h-44 w-44 bg-white p-2" />
      )}
      <p className="mono text-center text-[11px] break-all text-text-tertiary">
        Can’t scan? Enter manually: {secret}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Input
        aria-label="Authenticator code"
        className="mono tracking-[0.2em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Verifying…" : "Verify & enable"}
      </Button>
    </form>
  );
}
