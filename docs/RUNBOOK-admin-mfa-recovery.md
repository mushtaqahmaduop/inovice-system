# RUNBOOK — Admin MFA lockout recovery

**Scenario:** the admin (owner) cannot produce a TOTP code — lost/reset phone,
deleted authenticator entry, or a corrupted factor. Staff accounts are not
MFA-gated; this runbook is about the admin role (CLAUDE.md §2: TOTP is
mandatory for admin).

TOTP recovery codes are a custom layer (Supabase has none natively): 8
one-time codes are generated at enrollment, shown exactly once, and stored
only as SHA-256 hashes in `mfa_recovery_codes` (owner-scoped RLS; codes die
with the auth user). Regenerating codes invalidates all previous ones.

## Path 1 — self-service recovery code (preferred, no operator needed)

Preconditions: the admin knows their password and has a saved recovery code.

1. Sign in at `/login` with email + password. On the code screen choose
   **“Lost your authenticator? Use a recovery code.”**
2. Enter any unused recovery code. The server consumes it (single-use) and
   unenrolls the TOTP factor via the auth admin API — this is the one
   sanctioned service-role operation (SCHEMA_DESIGN §5 / S-5.4); identity
   still comes only from the verified session.
3. The middleware immediately routes the admin to `/mfa-setup` (R-9.2 —
   an admin without a factor can reach nothing else). Re-enroll with the new
   authenticator; a fresh set of recovery codes is issued and the old set is
   wiped.

Wrong/used codes fail uniformly (no oracle) with a small delay. Recovery
codes are ~50 bits from a no-confusables alphabet — online guessing is not a
realistic path, and each attempt needs the password first.

## Path 2 — operator removes the factor (dashboard)

Preconditions: Path 1 impossible (no saved codes, or password also lost —
reset the password first via Supabase's recovery email).

1. Operator (Mushtaq) signs in to the Supabase dashboard → project →
   **Authentication → Users** → select the admin user.
2. Delete the user's TOTP factor (Factors section).
3. The admin signs in with password only; the middleware forces `/mfa-setup`;
   they re-enroll and receive fresh recovery codes.

## Path 3 — last resort (SQL)

Only if the dashboard is unavailable. Against the correct project (staging
ref `kxtbxgcvwxvlsoygjvvi`; production per its own env), as `postgres`:

```sql
-- find the factor
select id, factor_type, status from auth.mfa_factors
 where user_id = (select id from auth.users where email = '<admin email>');
-- remove it
delete from auth.mfa_factors where id = '<factor id>';
```

Then the admin re-enrolls as above. Never edit `public.*` tables for this;
MFA state lives entirely in the `auth` schema plus `mfa_recovery_codes`.

## Invariants (do not "fix" these while recovering)

- No session ever bypasses the aal2 gate: recovery removes the factor, it
  never fakes a verification. The admin is *less* privileged (locked to
  `/mfa-setup`) until re-enrolled.
- Deactivated users cannot use Path 1: `is_active = false` cuts off login
  usefulness via RLS and the `issue_invoice` guard regardless of MFA state.
- After any Path 2/3 recovery, confirm with the admin that they hold new
  recovery codes before closing the incident.
