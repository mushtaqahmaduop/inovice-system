# RUNBOOK — Monthly backup export & restore drill (task 7.6)

**Why this exists (F-3 / D-06):** UAE FTA retention means the invoice
ledger must survive for 5 years — including surviving the loss of the
Supabase account itself. Supabase Pro's daily backups protect against
Supabase-side incidents; **this monthly export is the client-owned copy**
that protects against account/billing/vendor failure. A backup that has
never been restored is a hope, not a backup — hence the drill.

## What is exported

`pg_dump --format=custom --schema=public` — every business table:
customers, services, settings, payment_methods, profiles, invoices,
invoice_lines, invoice_extra_columns, invoice_line_fees, payments,
invoice_events, mfa_recovery_codes (hashes only). Supabase-managed schemas
(`auth`, `storage`, `realtime`) are intentionally excluded: login accounts
are recreatable; the ledger is not.

## Prerequisites (one-time per machine)

1. PostgreSQL 17 client/server binaries — no install needed, unzip is
   enough: <https://github.com/theseus-rs/postgresql-binaries/releases>
   (pick `17.x` / `x86_64-pc-windows-msvc`), or any PostgreSQL 17 install.
   Match the server: Supabase runs **17.6**, and `pg_dump` must never be
   older than the server it dumps.
2. Set `PG_BIN` to the unzipped `bin` directory. Put it in `.env.local` —
   it is machine-local, gitignored, and both scripts already load that
   file, so nothing has to be exported per shell.
3. `.env.local` with `DATABASE_URL_MIGRATIONS` (session pooler `:5432` —
   pg_dump cannot use the transaction pooler `:6543`).

**This laptop (Mushtaq's), done 2026-08-10:** binaries unzipped to
`C:\pgsql\17\postgresql-17.6.0-x86_64-pc-windows-msvc\bin`, and
`PG_BIN=C:/pgsql/17/postgresql-17.6.0-x86_64-pc-windows-msvc/bin` is in
`.env.local` (forward slashes — a `\p`/`\b` in a dotenv value is a trap).
Nothing further is needed; the commands below run as written.

## Monthly ritual (operator: Mushtaq — 1st of each month)

```powershell
cd C:\Inovice-system
node --env-file=.env.local scripts/backup.mjs
```

1. Produces `backups/invoice-ledger-YYYY-MM-DD.dump` (gitignored — ledger
   data never enters git).
2. **Copy the file to client-owned storage.** ⛔ Which storage is the
   client's (Google Drive of the business account, a USB kept at the
   office, …) is an open client question — until answered, keep TWO
   copies: operator's drive + a cloud drive. The local `backups/` folder
   alone does NOT count.
3. Keep all monthly files for 5 years (FTA). ~300 invoices/month keeps
   each file small; storage is not a concern.

## Restore drill (quarterly, and after any schema change to money paths)

```powershell
cd C:\Inovice-system
node --env-file=.env.local scripts/restore-drill.mjs backups\invoice-ledger-YYYY-MM-DD.dump
```

The drill needs no Supabase project and no admin rights: it boots a
throwaway local PostgreSQL (initdb into a temp dir), restores the dump,
and verifies:

- **reference data** — all nine ledger tables exist and every row count
  equals live (this is the "the dump is not empty" guard; it has to be a
  row-count check rather than "are there invoices?", because a shop that
  went live this morning legitimately has none yet);
- sealed subtotals + VAT recompute exactly from the restored lines
  (`sum(qty × unit fee)` in integer fils);
- totals, line counts and payment sums equal the live database
  row-for-row;
- the append-only `invoice_events` log is fully present.

With an empty ledger the three sealed-invoice checks are vacuous and the
drill says so in its output rather than quietly counting them as proof.

Exit code 0 + `0 failed` = the done-criterion ("a restored invoice matches
its sealed totals") holds for the whole ledger. The scratch server is
destroyed afterwards.

### Expected restore noise

The dump is public-schema-only, so two object classes cannot be recreated
in a scratch server and are reported then skipped: the `profiles →
auth.users` foreign key, and RLS policies referencing `auth.uid()` (stubs
are pre-created to keep most). Both are access-control wiring, not ledger
data — the drill fails hard on any DATA mismatch.

### Run on staging vs production

The scripts read whatever `DATABASE_URL_MIGRATIONS` points at. Today that
is staging; **after the 7.5 production handover, point `.env.local` (or a
`.env.production.local` passed via `--env-file`) at the production session
pooler and this runbook applies unchanged.** The live-comparison step
assumes no writes happen between dump and drill; run it outside business
hours or accept payment-sum drift as the only legitimate difference.

## Recovery (the day it's actually needed)

1. Create a fresh Supabase project (or any PostgreSQL 15+).
2. Run every repo migration (`pnpm db:migrate`, currently 0001–0018) so
   triggers, RLS and
   functions exist, then `pg_restore --data-only --disable-triggers` the
   dump — or for a bare "read the ledger for the FTA" scenario, restore
   the dump as in the drill and query directly.
3. Re-run the drill's verification against the recovered copy before
   trusting it.
