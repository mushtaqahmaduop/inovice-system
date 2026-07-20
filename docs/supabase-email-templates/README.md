# Supabase auth email templates

Supabase Auth's transactional emails (password reset, invites, etc.) are
configured in the Supabase Dashboard, not in this repo's code — these files
are the source-of-truth HTML to paste in, kept here so the template is
version-controlled and reviewable like everything else.

## Installing `reset-password.html`

1. Supabase Dashboard → **Authentication → Email Templates → Reset Password**.
2. Subject: `Reset your Prestige Land password`
3. Message body: paste the full contents of `reset-password.html` (it's a
   complete HTML document — Supabase accepts that directly).
4. Save, then send yourself a test reset from `/forgot-password` to confirm
   the button renders and `{{ .ConfirmationURL }}` lands on `/update-password`
   via `/auth/callback`.

Uses only Supabase's built-in template variables (`{{ .Email }}`,
`{{ .ConfirmationURL }}`) — no custom template data required.

## Fixing delivery (the "email never arrives" issue)

The template above doesn't fix deliverability — that's a separate setting.
Supabase's default auth mailer is a shared sender with a low per-project rate
limit and inconsistent inbox placement. This project's locked stack already
uses **Resend** for email (`CLAUDE.md` §2); point Supabase's auth mailer at
it too:

1. Get an API key from the Resend dashboard for a domain you've verified there.
2. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**
   → enable **Custom SMTP** and fill in:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: an address on the verified Resend domain (e.g.
     `noreply@yourdomain.com`) — must match the domain, not a free Gmail
     address, or Resend will reject the send
   - Sender name: `Prestige Land`
3. Save, then re-test the reset flow end to end.

## Design tokens used

Colors are hardcoded hex, not CSS variables — email clients don't reliably
support `var()` or even `<style>` blocks, so every value here is copied
directly from `app/globals.css`'s light-mode `:root` tokens (`--accent:
#1d4ed8`, `--text: #1a1f2a`, `--text-secondary: #59616f`, `--text-tertiary:
#8b93a1`, `--border: #e6e8ee`, `--surface: #ffffff`, `--bg: #f6f7f9`). No
dark-mode variant — transactional emails universally ship light-only and let
the mail client's own dark-mode auto-inversion handle it, which is what
produced the dark rendering in the Sentry reference screenshot.
