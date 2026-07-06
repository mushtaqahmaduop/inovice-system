# Handover — admin walkthrough notes (task 7.5, draft)

**App:** https://inovice-system.vercel.app (no custom domain — client's decision, Q-16)
**Trainee:** Mr Sahil (client's answer, Q-17). **Operator:** Mushtaq.
**Status:** DRAFT — usable for training on the current environment today; the
"production cutover" section at the end lists what still needs credentials.

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
- Uptime: GitHub Actions pings production every 15 min; a failure emails you
  (`.github/workflows/uptime.yml`).
- Monthly backup + quarterly restore drill: `pnpm db:backup`, `pnpm db:drill`
  — full ritual in RUNBOOK-backup-restore.md. **Destination for the monthly
  file is still an open client question.**
- After destructive test runs on staging: `pnpm db:reseed`.

## Part 4 — Production cutover checklist (blocked items)

| # | Step | Needs |
|---|------|-------|
| 1 | Supabase production project → **Pro tier** (daily backups, FTA retention) | client/Mushtaq payment |
| 2 | Run migrations 0001–0010 + `pnpm db:reseed` against production | prod connection string |
| 3 | Vercel env vars → production Supabase creds; redeploy | prod creds |
| 4 | Rotate staging keys (they passed through chat during development) | 5 min in dashboard |
| 5 | Set access-token TTL ~10 min in Supabase dashboard (staging AND prod) | manual dashboard step |
| 6 | Change the admin temp password; enroll TOTP on the real device | first login |
| 7 | Upload the real logo once the client sends the file (6.1) | logo file |
| 8 | Point `db:backup`/`db:drill` at production per the runbook | prod creds |
| 9 | Walk Mr Sahil through Parts 1–2 of this document, live | scheduling |

*Line endings, formatting and print CSS notes live in FINDINGS.md / DECISIONS.md.*
