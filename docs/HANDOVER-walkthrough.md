# Handover — admin walkthrough notes (task 7.5, draft)

**App:** https://inovice-system-lyart.vercel.app
> ⚠ **Corrected 2026-08-10.** This document previously gave
> `inovice-system.vercel.app`, which returns 404 `DEPLOYMENT_NOT_FOUND` — that
> host does not exist. The address above is the live one, and is what the uptime
> monitor has always probed. No custom domain yet (client's decision, Q-16 —
> **reopened for the client in `CLIENT-BRIEFING-2026-08-10.md`**, because an
> address owned by the hosting company is exactly what caused this).

**Trainee:** Mr Sahil (client's answer, Q-17). **Operator:** Mushtaq.
**Status:** live — the ledger was cleared for go-live on 2026-08-10 and the
first real invoice will be INV-1. Outstanding items are in
`AUDIT_2026-08-10.md`; the cutover table at the end reflects them.

---

## Part 1 — For every user (staff and admin)

### Signing in

1. Open the app URL, enter your email and password.
2. **Admin accounts must set up two-factor**: on first login you are taken to
   a QR code — scan it with Google Authenticator (or any authenticator app)
   on your phone. After that, every login asks for the 6-digit code.
3. Save the **recovery codes** shown after enrollment somewhere safe (printed
   and locked away is fine). If the phone is lost, a recovery code is the way
   back in — each one works once.
4. Staff accounts sign in with just email + password.

### The one rule that explains everything: "sealed"

A draft invoice can be edited freely. The moment you press **Confirm &
Issue**, the invoice is **sealed**: it gets its official number and can never
be changed by anyone — not staff, not admin, not the developer. This is a
legal requirement (UAE FTA), not a software limitation. Mistake on a sealed
invoice? → **void it** and issue a replacement (admin action, see below).
"Sealed" has nothing to do with payment — an unpaid invoice is just as sealed.

### Daily work: making an invoice (staff)

1. **New invoice** in the sidebar (or press `Ctrl+K` and search anywhere).
2. Pick the customer — or quick-add a **walk-in** with just a name.
3. Add lines: service, quantity, government fee + service fee columns.
   Totals compute as you type.
4. **Save as draft** if the customer steps away — open drafts appear on the
   New-invoice page and carry a count badge in the sidebar.
5. **Issue** → a preview slides in → check it with the customer → **Confirm
   & Issue**. The number (INV-…) is assigned at this exact moment.
6. Print from the sealed view (A4). Hand over the paper; done.

### Recording money (staff)

- Open the sealed invoice → **Payments** panel → amount, method (cash/bank/
  card), date, optional reference → **Record payment**.
- Paid status is calculated from recorded payments — there is no "mark as
  paid" switch. Partial payments are fine.
- Recorded a payment by mistake? **Reverse** adds a negative correction row;
  nothing is ever deleted. History always tells the truth.

### Finding things

- `Ctrl+K` from anywhere: customer names and invoice numbers.
- **Invoices** list: filter by status (draft/sealed/voided), payment
  (unpaid/partial/paid/**overdue** — the orange one), and date range.
- **Customers → open a customer**: their full ledger — every invoice, every
  payment, and the outstanding balance.

### The dashboard answers "who owes us"

Outstanding balances lead the page (the client asked for exactly this).
Click any debtor to open their ledger. Month totals and VAT collected sit
alongside; the activity feed shows recent actions with who did them.

## Part 2 — Admin only (owner / Mr Sahil after training)

- **Void an invoice** (sealed view → Void): requires a reason, optionally
  creates a replacement draft with the lines copied over. The void and the
  replacement stay linked on both documents.
- **Users** (Administration → Users): create staff/admin accounts, deactivate
  anyone instantly (their session dies on the next request), reset passwords.
- **Settings**: company details on the invoice header, VAT mode (currently
  OFF — deregistered launch per the authority's guidance), invoice number
  format, due days (7), payment methods (deactivate, never delete).
- **Exports** (Administration → Exports): invoices / payments / VAT CSVs by
  date range — this is what the accountant gets. Requires an admin with
  two-factor passed.
- **MFA recovery**: an admin who lost both phone and recovery codes needs the
  operator (see RUNBOOK-admin-mfa-recovery.md).

## Part 3 — Operator runbook pointers (Mushtaq)

- Deploy: merge to `main`, then `vercel deploy --prod` from the repo.
- Uptime: GitHub Actions pings production and a failure emails you
  (`.github/workflows/uptime.yml`). The cron asks for every 15 min, but GitHub
  throttles scheduled runs on free runners — **observed cadence is 35–120 min**.
  Treat it as an hourly check, not a 15-minute one. It probes the login page
  only, so it proves the site is up, not that issuing an invoice works.
- Monthly backup + quarterly restore drill: `pnpm db:backup`, `pnpm db:drill`
  — full ritual in RUNBOOK-backup-restore.md. **Destination for the monthly
  file is still an open client question.**
- After destructive test runs on staging: `pnpm db:reseed`.

## Part 4 — Production cutover checklist

Re-verified 2026-08-10. Full detail and evidence in `AUDIT_2026-08-10.md`.

> **The original "cut over to the production Supabase project" steps are gone.**
> They described a migration that events overtook: go-live happened on the
> *staging* project, so that project **is** production now, and moving a live
> ledger of sealed invoices for the sake of a name is not worth the risk.
> How the environments should actually be arranged — two Supabase databases,
> one Vercel project with three environment scopes, and who wires each part —
> is in **`docs/ENVIRONMENTS.md`**.

| # | Step | Status |
|---|------|--------|
| 1 | Ledger cleared for go-live; counter reset → next invoice is INV-1 | ✅ done (PR #103/#105) |
| 2 | Test/demo accounts removed; only the 4 real staff remain | ✅ done (PR #106) |
| 3 | Migrations applied (0000–0018) and verified | ✅ 19 tracked, audit clean |
| 4 | Database invariants verified (`pnpm audit:db`) | ✅ 46 passed · 0 failed |
| 5 | Backup + restore drill scripted and exercised | ✅ done (PR #105) |
| 6 | **Fix Supabase `site_url` / `uri_allow_list`** — still the dead host, so password-reset emails link to a 404 | ⛔ **DO FIRST** — dashboard |
| 7 | ~~Confirm Supabase = **Pro**~~ — client chose to stay on **free** (contradicts D-06, raised in the audit). Confirm instead that the Vercel plan permits commercial use | ⚠ dashboard, unverifiable from the repo |
| 8 | ~~Copy `backups/` off this laptop~~ — automated nightly encrypted backups now run in the private repo `inovice-system-backups`, verified by restore drill | ✅ done — **client-owned destination still open** (briefing Q1) |
| 8a | **Rename both Supabase projects so the names match reality** — the one called *staging* is production | ⛔ dashboard, 1 min. See `ENVIRONMENTS.md` |
| 8b | **Check Vercel's Preview environment does not point at the live database** — if it does, opening a PR can write to the real ledger | ⛔ dashboard, 2 min. See `ENVIRONMENTS.md` §5 |
| 8c | Resume the empty project as **staging**, then migrations + seed + test-suite proof | ⛔ owner does 3 dashboard steps; the rest is scripted. See `ENVIRONMENTS.md` §6 |
| 9 | Guard `pnpm test:db:*` / `db:reseed` against the production database | ✅ done (PR #108) — `db/guard.mjs`, fails closed |
| 10 | Sentry (task 7.2) — SDK wired, project `zeerak-services/invoice-system` created, delivery + alert rule verified end to end | ⚠ **one step left: add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel, then redeploy** — until then production is still silent |
| 11 | Security headers in `next.config.ts` (CSP, X-Frame-Options, …) | ✅ done — click-through check owed in a browser |
| 12 | Access-token TTL ~10 min on production | ⛔ dashboard |
| 13 | Admin passwords changed; TOTP enrolled on real devices | ✅ 2 admins, 16 recovery codes live |
| 14 | Real logo uploaded (not the placeholder block) | ⚠ confirm |
| 15 | Manual print check: sealed invoice → PDF on A4 **and** A5 | ⚠ 2 min, owed |
| 16 | Walk Mr Sahil through Parts 1–2 live | ⚠ scheduling |

*Line endings, formatting and print CSS notes live in FINDINGS.md / DECISIONS.md.*
