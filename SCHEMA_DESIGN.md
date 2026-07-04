# SCHEMA_DESIGN.md — Data Model (Draft v1)

**Status:** Draft written outside the codebase from PROJECT_PLAN.md + DECISIONS.md. First Claude Code planning session must review, challenge, and finalize this before any migration is written.
**Conventions:** Postgres via Supabase. Drizzle ORM. All money in **fils (AED × 100) as `bigint`** — never floats. All tables get `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`. Business entities get `deleted_at timestamptz` (soft delete). Times in UTC; render in Asia/Dubai.

---

## 1. Table overview

| Table | Purpose | Mutability |
|---|---|---|
| `settings` | Single-row company config | Mutable (admin only) |
| `profiles` | App users, extends Supabase `auth.users` | Mutable (admin only) |
| `customers` | Regular + walk-in customers | Mutable, soft delete |
| `invoices` | Invoice header | Draft: mutable · Issued: **frozen** |
| `invoice_lines` | Line items (two-fee structure) | Frozen once parent issued |
| `invoice_extra_charges` | Dynamic per-invoice extra columns | Frozen once parent issued |
| `payments` | One row per payment received | **Insert-only** (void via reversal row) |
| `invoice_events` | Append-only audit trail | **Insert-only, DB-enforced** |
| `invoice_counters` | Gapless numbering state | Only via `issue_invoice()` function |

## 2. Tables

### 2.1 `settings` (single row)
- `company_name text`, `company_name_ar text null` (pending Q-08)
- `trn text null` — UAE Tax Registration Number
- `address text`, `phone text`, `email text`, `logo_path text null` (Supabase Storage)
- `vat_registered boolean not null default true` — the Settings toggle (D-16); affects future invoices only
- `vat_rate_bp integer not null default 500` — basis points (500 = 5%)
- `invoice_number_format text not null default 'INV-{NN}'` — configurable (D-12)
- `paper_size text not null default 'A4'` (pending Q-07)
- `updated_at`, `updated_by uuid references profiles`

### 2.2 `profiles`
- `id uuid primary key references auth.users`
- `full_name text`, `role text not null check (role in ('admin','staff'))`
- `is_active boolean not null default true` — deactivation, not deletion
- Session revocation (D-18) via Supabase Auth admin API; no schema needed beyond `is_active` checks in middleware.

### 2.3 `customers`
- `type text not null check (type in ('regular','walk_in'))` (D-17)
- `name text not null` — the only field walk-ins require
- `phone text null`, `email text null`, `trn text null`, `address text null` (finalize per Q-05)
- `notes text null`, `deleted_at`
- Index: `(type)`, trigram index on `name` for global search (D-18)

### 2.4 `invoices`
- `invoice_number text null unique` — **null while draft**; assigned only inside `issue_invoice()` (D-12)
- `status text not null default 'draft' check (status in ('draft','issued','voided'))`
- `customer_id uuid null references customers` — null allowed for pure walk-in (name captured below)
- `customer_snapshot jsonb null` — name/TRN/address frozen at issue (customer record may change later; the invoice must not)
- `issue_date date null`, `due_date date null` (conventions pending Q-11–17)
- **Issue-time snapshots (D-16):** `vat_registered_snapshot boolean null`, `vat_rate_bp_snapshot integer null`
- **Server-computed totals (fils):** `subtotal_govt bigint`, `subtotal_service bigint`, `subtotal_extras bigint`, `vat_amount bigint`, `grand_total bigint` — recomputed server-side at issue; client totals never trusted
- `payment_status text generated / derived` — implement as a **view or computed query** from `payments`, not a stored mutable column (D-14). If a stored column is used for query performance, it may only be written by a trigger on `payments`.
- `created_by uuid references profiles`, `issued_by uuid null`, `issued_at timestamptz null`
- `voided_by / voided_at / void_reason` — voiding creates an event + status change; financial columns stay frozen
- **Immutability enforcement (D-13):** DB trigger `BEFORE UPDATE` rejecting any change to financial columns / lines when `status <> 'draft'`, except the allowed transitions (issue, void) executed by security-definer functions.

### 2.5 `invoice_lines`
- `invoice_id uuid references invoices on delete cascade` (cascade applies to drafts only; issued invoices can't be deleted at all)
- `position integer not null` — display order (rendered as Roman numerals in UI, stored as int)
- `description text not null`
- `govt_fee bigint not null default 0` — 0% VAT passthrough (D-10)
- `service_fee bigint not null default 0` — VATable revenue (D-10)

### 2.6 `invoice_extra_charges` (D-11)
- `invoice_id`, `position integer`
- `label text not null` (e.g. "Courier", "Stamp")
- `amount bigint not null`
- `vatable boolean not null` — per-charge VAT-ability toggle

### 2.7 `payments` (D-14)
- `invoice_id uuid not null references invoices`
- `amount bigint not null` — positive; corrections via a negative reversal row + event, never UPDATE
- `method text not null check (method in ('cash','card','bank_transfer','cheque'))` (finalize per Q-10)
- `reference text null`, `received_on date not null`, `recorded_by uuid references profiles`
- Insert-only: revoke UPDATE/DELETE from app roles.

### 2.8 `invoice_events` (D-15)
- `invoice_id uuid not null references invoices`
- `event_type text not null check (event_type in ('created','draft_updated','issued','payment_recorded','payment_reversed','voided','printed','emailed'))`
- `actor_id uuid references profiles`, `payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- **DB-enforced append-only:** `CREATE RULE` or trigger raising exception on UPDATE/DELETE; revoke privileges as well.

### 2.9 `invoice_counters` (D-12)
- `year integer primary key`
- `last_number integer not null default 0`

## 3. `issue_invoice()` — the sealing transaction

Single Postgres function (security definer), the only path from draft to issued:

1. `SELECT … FOR UPDATE` the draft invoice; verify `status = 'draft'` and it has ≥1 line.
2. Recompute all totals server-side from lines + extra charges; snapshot `vat_registered` + `vat_rate_bp` from `settings`; snapshot customer fields into `customer_snapshot`.
3. Lock the counter: `INSERT INTO invoice_counters(year) VALUES ($yr) ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1 RETURNING last_number` (annual reset falls out of the per-year row).
4. Format the number per `settings.invoice_number_format`; write number, totals, snapshots, `status='issued'`, `issued_at/by`.
5. Insert `invoice_events` row (`issued`) in the same transaction.
6. Any failure ⇒ full rollback ⇒ no gap, no orphaned number.

## 4. RLS sketch

- All tables RLS-enabled. `profiles.role` claim drives policies.
- Staff: SELECT on business tables; INSERT on invoices/lines/extras/payments; UPDATE only on **draft** invoices they can access. No access to `settings` writes, no void, no user management.
- Admin: full app-level access; destructive-looking operations still flow through functions, not raw UPDATE/DELETE.
- `invoice_events`, `payments`: INSERT + SELECT only, for everyone including admin.

## 5. Deliberately out of schema

- No `paid_amount` on invoices (D-14). No multi-tenancy columns (single tenant). No PDF storage (D-09 — print CSS only; the immutable DB record + snapshots are the audit source). No credit-note table yet — voided + replacement invoice covers MVP; revisit if client needs formal credit notes (raise as question if so).

## 6. Known open items for the Claude Code review

1. Derived vs trigger-maintained `payment_status` — pick one and justify (query patterns: invoice list filtering by status).
2. Whether `customer_snapshot` fully replaces the FK at issue time or complements it (recommend: complement — keep FK for history queries).
3. Exact RLS policies per table — write them out fully.
4. Whether Q-08 (Arabic) forces schema additions now (`description_ar`?) — recommend NOT until answered.
