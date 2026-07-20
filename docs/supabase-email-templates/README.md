# Supabase auth email templates

Supabase Auth's transactional emails (password reset, invites, etc.) are
configured in the Supabase Dashboard, not in this repo's code — these files
are the source-of-truth HTML to paste in, kept here so the template is
version-controlled and reviewable like everything else.

## This project uses a 6-digit code, NOT a link

The `/forgot-password` page asks the user for a **6-digit code** and consumes
it with `verifyOtp({ type: "recovery" })` — see
`app/forgot-password/forgot-password-form.tsx`. So the reset email must carry
the raw one-time code via Supabase's **`{{ .Token }}`** variable.

This is deliberate. The code flow needs no clickable link, so it does **not**
depend on the project's Site URL / redirect config — which is exactly the
setting that sent an earlier link-based template to `localhost:3000` and broke
it. `reset-password.html` in this folder is code-based and shows `{{ .Token }}`.

> Do **not** reintroduce `{{ .ConfirmationURL }}` here. A link email would not
> match the code-entry form and would reopen the localhost-redirect bug.

## Installing `reset-password.html`

1. Supabase Dashboard → **Authentication → Email Templates → Reset Password**.
2. Subject: `Your Prestige Land password reset code`
3. Message body: paste the full contents of `reset-password.html` (it's a
   complete HTML document — Supabase accepts that directly). It renders the
   `{{ .Token }}` code in a boxed monospace figure.
4. Save, then send yourself a test reset from `/forgot-password`: the email
   should show a **6-digit code** (no button), and typing that code on the
   page should land you on `/update-password`.

Uses only Supabase's built-in template variables (`{{ .Email }}`,
`{{ .Token }}`) — no custom template data required.

## Site URL (only matters if any link-based flow is ever used)

The password-reset flow above is code-based and ignores Site URL. But other
auth emails (invites, magic links) do use it, and a wrong value is what
produced the `localhost:3000` "site can't be reached" page. If you ever enable
a link-based flow, set it correctly first:

- Supabase Dashboard → **Authentication → URL Configuration**
  - **Site URL**: `https://inovice-system.vercel.app`
  - **Redirect URLs**: add `https://inovice-system.vercel.app/**` (and any
    Vercel preview domains you test from). Remove stale `http://localhost:3000`
    entries so production links never point back at a dev machine.

## Fixing delivery (the "email never arrives" issue)

The template above doesn't fix deliverability — that's a separate setting.
Supabase's default auth mailer is a shared sender (`noreply@mail.app.supabase.io`)
with a low per-project rate limit and inconsistent inbox placement; it's only
suitable for testing. For real client mailboxes, point Supabase's auth mailer
at a proper SMTP provider:

1. Get an API key from your email provider (e.g. Resend) for a domain you've
   verified there.
2. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**
   → enable **Custom SMTP** and fill in:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: an address on the verified domain (e.g.
     `noreply@yourdomain.com`) — must match the domain, not a free Gmail
     address, or the send will be rejected
   - Sender name: `Prestige Land`
3. Save, then re-test the reset flow end to end.

## Design tokens used

Colors are hardcoded hex, not CSS variables — email clients don't reliably
support `var()` or even `<style>` blocks, so every value here is copied
directly from `app/globals.css`'s light-mode `:root` tokens (`--accent:
#1d4ed8`, `--text: #1a1f2a`, `--text-secondary: #59616f`, `--text-tertiary:
#8b93a1`, `--border: #e6e8ee`, `--surface: #ffffff`, `--bg: #f6f7f9`). No
dark-mode variant — transactional emails universally ship light-only and let
the mail client's own dark-mode auto-inversion handle it.
