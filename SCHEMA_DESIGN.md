# SCHEMA_DESIGN.md — Data Model (v2 — post-adjudication, approved for build)

**Status:** Final buildable spec. Supersedes v1 draft. Incorporates ADJUDICATION.md Part 3 items 1–12 (traceability tags `[#n]` throughout; findings resolve in `docs/REVIEW_REPORT.md`).
**Conventions:** Postgres via Supabase. Drizzle ORM, append-only SQL migrations. All money in **fils (AED × 100) as `bigint` — the only permitted representation** (no floats, no `numeric`). All tables get `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()` unless noted. Business entities get `deleted_at timestamptz` (soft delete). Times in UTC; render in Asia/Dubai.
**Unit-fee semantics [#2]:** every per-line fee column stores the **unit** fee in fils; the line component total is always `qty × unit_fee`. Nothing stores a pre-multiplied line total except the frozen VAT amounts written at issue.

---

## 1. Table overview (12 tables)

| Table | Purpose | Mutability |
|---|---|---|
| `settings` | Single-row company config | Mutable (admin only) |
| `profiles` | App users, extends Supabase `auth.users` | Mutable (admin only) |
| `customers` | Regular + walk-in customers | Mutable, soft delete |
| `services` [#1] | Service catalogue (unit govt/service fees) | Mutable (admin only), soft delete |
| `payment_methods` [#6] | Payment-method lookup (admin-editable, no migrations) | Mutable (admin only) |
| `invoices` | Invoice header | Draft: mutable · Issued: **frozen** (trigger matrix §4.1) |
| `invoice_lines` | Line items (two-fee structure, qty) | Frozen once parent issued (parent-lock trigger §4.3) |
| `invoice_extra_columns` [#3] | Per-invoice dynamic extra fee-column definitions | Frozen once parent issued |
| `invoice_line_fees` [#3] | Junction: per-line amount for each extra column | Frozen once parent issued |
| `payments` | One row per payment received | **Insert-only** (three-layer §4.2; reversal rows) |
| `invoice_events` | Append-only audit trail | **Insert-only** (three-layer §4.2) |
| `invoice_counters` | Gapless numbering state | Only via `issue_invoice()` |

## 2. Tables

### 2.1 `settings` (single row)
- `company_name text not null`, `company_name_ar text null` (pending Q-08)
- `tagline text null` [#11] — printed under the company name on invoices
- `trn text null` — UAE Tax Registration Number. **Keep populated during deregistration; simply not printed while `vat_registered = false`** (REVIEW_REPORT F-4b).
- `address text`, `phone text`, `email text`, `logo_path text null` (Supabase Storage)
- `bank_details text null` [#11] — invoice footer bank line
- `vat_registered boolean not null default true` (D-16; affects future invoices only)
- `vat_rate_bp integer not null default 500` — basis points (500 = 5%)
- `invoice_number_format text not null default 'INV-{NN}'` (D-12)
- `paper_size text not null default 'A4'` (pending Q-07)
- `invoice_notes_default text null`, `invoice_terms_default text null` — prefill for new drafts (traced to REVIEW_REPORT S-10 #4; the prototype ships default notes/terms text)
- `due_days_default integer null` — configurable overdue convention until Q-11 answers (BUILD_PHASES 5.1)
- `updated_at timestamptz`, `updated_by uuid references profiles`

### 2.2 `profiles`
- `id uuid primary key references auth.users`
- `full_name text not null`, `role text not null check (role in ('admin','staff'))`
- `is_active boolean not null default true` — deactivation, not deletion. **Checked inside the RLS policy function** (§5), not only in middleware.

### 2.3 `customers`
- `type text not null check (type in ('regular','walk_in'))` (D-17)
- `name text not null` — the only field walk-ins require
- `phone`, `email`, `trn`, `address` all `text null` (finalize per Q-05)
- `notes text null`, `deleted_at`
- Indexes: `(type)`; GIN trigram on `name` (global search, D-18)
- **Walk-in rule [#7]:** the invoice form's "new walk-in" path always quick-creates a minimal row here (name, `type='walk_in'`). There is no invoice without a customer row.

### 2.4 `services` [#1]
- `name text not null`
- `govt_fee bigint not null default 0` — **unit** fee, fils, 0% VAT passthrough
- `service_fee bigint not null default 0` — **unit** fee, fils, VATable revenue
- `unit text not null default 'unit'` (e.g. 'person', 'page', 'doc')
- `is_active boolean not null default true`, `deleted_at`
- Admin-editable only (RLS §5). Seeded per prototype catalogue (fees converted to fils). **Fixture rule:** seed the catalogue's unit fees, never the prototype's invoice/payment amounts (ADJUDICATION #28 — prototype invoices INV-153/151/150 are internally wrong).

### 2.5 `payment_methods` [#6, R-2]
- `label text not null unique` — seeded: Cash, Card, Bank transfer, Cheque (pending Q-10; admin edits rows instead of migrating a CHECK)
- `is_active boolean not null default true`, `position integer not null default 0`
- Gives DB-enforced integrity (FK from `payments`) **and** runtime configurability — the R-2 ruling.

### 2.6 `invoices`
- `invoice_number text null` — **display text only, NOT unique** [#4]; null while draft; rendered from `invoice_number_format` at issue
- `number_year integer null`, `number_seq integer null`, **`unique (number_year, number_seq)`** [#4] — the real uniqueness; survives the annual reset (REVIEW_REPORT S-4)
- `status text not null default 'draft' check (status in ('draft','issued','voided'))`
- `customer_id uuid not null references customers` [#7]
- `customer_snapshot jsonb null` — name/TRN/address/phone frozen at issue
- `issue_date date null`, `supply_date date null` (**VERIFY** — FTA "date of supply if different", REVIEW_REPORT F-1) [#11], `due_date date null` (conventions pending Q-11)
- Issue-time snapshots (D-16): `vat_registered_snapshot boolean null`, `vat_rate_bp_snapshot integer null`
- Server-computed totals (fils): `subtotal_govt bigint`, `subtotal_service bigint`, `subtotal_extras bigint`, `vat_amount bigint`, `grand_total bigint`
- `notes text null`, `terms text null` [#11] — editable while draft, frozen after
- `replaces_invoice_id uuid null references invoices` [#11] — links a replacement invoice to the voided original
- **No stored payment status** [#8] — derived at read time (§6)
- `created_by uuid references profiles`, `issued_by uuid null`, `issued_at timestamptz null`, `voided_by uuid null`, `voided_at timestamptz null`, `void_reason text null`
- Indexes: `(status)`, `(customer_id)`, `(issue_date)`, `unique(number_year, number_seq)`, **GIN trigram expression index on `(customer_snapshot->>'name')`** [#11] — global search must find issued invoices by snapshot name even after the customer record changes

### 2.7 `invoice_lines`
- `invoice_id uuid not null references invoices on delete cascade` (cascade reaches drafts only — §4.1 delete guard)
- `position integer not null` (rendered as Roman numerals in UI)
- `description text not null`
- `qty integer not null default 1 check (qty > 0)` [#2]
- `govt_fee bigint not null default 0` — **unit** fee (0% VAT passthrough, D-10)
- `service_fee bigint not null default 0` — **unit** fee (VATable revenue, D-10)
- `vat_amount bigint not null default 0` [#5] — **frozen per-line VAT written at issue** (rounding rule §3.1); stays 0 while draft

### 2.8 `invoice_extra_columns` [#3, R-1]
Per-invoice definitions of the dynamic fee columns (D-11 — columns, not flat charges):
- `invoice_id uuid not null references invoices on delete cascade`
- `label text not null` (e.g. "Courier", "Stamp")
- `vatable boolean not null`
- `position integer not null`

### 2.9 `invoice_line_fees` [#3, R-1]
Junction holding each line's amount in each extra column:
- `line_id uuid not null references invoice_lines on delete cascade`
- `column_id uuid not null references invoice_extra_columns on delete cascade`
- `amount bigint not null default 0` — **unit** amount, fils (line component total = line.qty × amount)
- `vat_amount bigint not null default 0` [#5] — frozen at issue when the column is vatable
- `unique (line_id, column_id)`
- Junction over JSONB per R-1: typed bigint + NOT NULL + FK integrity on money; clean SQL summation inside `issue_invoice()`; natural home for frozen per-charge VAT.

### 2.10 `payments`
- `invoice_id uuid not null references invoices`
- `amount bigint not null check (amount <> 0)` [#6] — corrections via a negative reversal row, never UPDATE
- `method_id uuid not null references payment_methods` [#6, R-2]
- `reverses_payment_id uuid null references payments` [#6] — pairs a reversal with its original
- `reference text null`, `received_on date not null`, `recorded_by uuid references profiles`
- **Insert-only via the three-layer recipe (§4.2).** Index: `(invoice_id)` (explicit — the derived-status join depends on it).

### 2.11 `invoice_events`
- `invoice_id uuid not null references invoices`
- `event_type text not null check (event_type in ('created','draft_updated','issued','payment_recorded','payment_reversed','voided','printed','emailed'))`
- `actor_id uuid references profiles`, `payload jsonb not null default '{}'`
- **Insert-only via the three-layer recipe (§4.2).** `'printed'` means **print requested** — the browser cannot confirm completion; this is best-effort by design (REVIEW_REPORT S-10), do not "fix" it into a guarantee.

### 2.12 `invoice_counters`
- `year integer primary key`
- `last_number integer not null`
- Written only by `issue_invoice()`. No app-role privileges at all (§5).

## 3. `issue_invoice()` — the sealing transaction

Single Postgres function, `SECURITY DEFINER` with **`SET search_path = public, pg_temp`** pinned [#9]. The **only** path from draft to issued; CLAUDE.md forbids ever reimplementing it as an app-orchestrated multi-statement transaction (R-4).

1. `SELECT … FOR UPDATE` the invoice row; verify `status = 'draft'`, ≥ 1 line, `customer_id` present. (Status check **after** lock acquisition — a racing second caller blocks here, re-reads `issued`, and aborts. No duplicate possible; REVIEW_REPORT S-2.)
2. Read `settings` in a **single statement**: `vat_registered`, `vat_rate_bp`, `invoice_number_format` (one atomic snapshot — no torn read against a concurrent Settings change).
3. Recompute all totals server-side in fils from `invoice_lines` + `invoice_extra_columns`/`invoice_line_fees`, applying the rounding rule (§3.1). **Write the frozen per-line `vat_amount`s now, while the parent is still `'draft'`** — the child parent-lock trigger (§4.3) rejects child writes under a non-draft parent, so this ordering is load-bearing. Snapshot customer fields into `customer_snapshot`.
4. **Counter allocation — deliberately last-before-write** (R-3 kernel: shortest possible hold on the shared row lock):
   ```sql
   INSERT INTO invoice_counters (year, last_number)
   VALUES ($yr, 1)
   ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1
   RETURNING last_number;
   ```
   Seeded with **1** [#4] — the v1 draft's single-column INSERT returned the default 0 for the first invoice of every year (REVIEW_REPORT S-1). Test: first invoice of a fresh year gets seq 1.
5. UPDATE the invoice: `number_year`, `number_seq`, formatted `invoice_number`, totals, snapshots, `status='issued'`, `issued_by/at`. (Passes the immutability matrix §4.1 as the draft→issued transition.)
6. INSERT the `invoice_events` row (`'issued'`) in the same transaction.
7. Any failure ⇒ full rollback ⇒ counter increment reverts with everything else ⇒ **no gap, no orphaned number** (counter row is MVCC data, not a sequence).

Gapless/duplicate proof and locking order: each issuer locks (1) its own invoice row — distinct per issuer — then (2) the shared counter row, always in that order; the shared resource is acquired last, so the classic deadlock shape cannot form. The counter serializes all issues — fine at ~15/day.

### 3.1 VAT rounding rule [#5]
Per vatable component: `vat = round_half_up(qty × unit_fee_fils × vat_rate_bp / 10000)` — **nearest fils, half-up, line-item basis**. Invoice `vat_amount` = Σ of the rounded per-line amounts (never re-rounded from the subtotal). Frozen per-line/per-fee `vat_amount`s guarantee any future render agrees with the sealed totals forever. **VERIFY:** exact FTA provision to be confirmed by the client's accountant (DECISIONS.md VERIFY register) — record the citation here once confirmed.

## 4. Enforcement triggers

### 4.1 Invoice immutability — the column-transition matrix [#9]
`BEFORE UPDATE ON invoices` trigger. The trigger validates the **shape of the change**, not the caller (Postgres triggers cannot see which function is executing — REVIEW_REPORT S-5.2b):

| OLD.status → NEW.status | Columns permitted to change (everything else must satisfy `OLD IS NOT DISTINCT FROM NEW`) |
|---|---|
| `draft` → `draft` | `customer_id`, `issue_date`, `supply_date`, `due_date`, `notes`, `terms` (draft edits; totals stay NULL until issue) |
| `draft` → `issued` | `status`, `invoice_number`, `number_year`, `number_seq`, `customer_snapshot`, `issue_date`, `supply_date`, `vat_registered_snapshot`, `vat_rate_bp_snapshot`, `subtotal_govt`, `subtotal_service`, `subtotal_extras`, `vat_amount`, `grand_total`, `issued_by`, `issued_at` — additionally require `OLD.invoice_number IS NULL` and `OLD.number_seq IS NULL` |
| `issued` → `voided` | `status`, `voided_by`, `voided_at`, `void_reason`, `replaces_invoice_id` — **nothing financial** |
| any other transition, or any other changed column | `RAISE EXCEPTION` |

`BEFORE DELETE ON invoices`: `RAISE EXCEPTION` unless `OLD.status = 'draft'` — this is what makes the child cascades safe (RLS cannot stop a cascade or `service_role`; REVIEW_REPORT S-5.3).

### 4.2 Append-only, for `payments` AND `invoice_events` — the three-layer recipe [#9]
1. `REVOKE UPDATE, DELETE ON payments, invoice_events FROM anon, authenticated;`
2. RLS enabled with **no** UPDATE/DELETE policy for any role (admin included — D-15);
3. `BEFORE UPDATE OR DELETE` trigger that unconditionally raises.
Layer 3 is the one that also binds `service_role` and the Supabase dashboard. Residual risk: a Postgres superuser can `ALTER TABLE … DISABLE TRIGGER` — accepted at this tier; mitigated by the event log, daily backups + monthly offsite export, and single-admin discipline (documented in the runbook, not papered over).
`CREATE RULE` (v1's suggestion) is rejected — legacy mechanism, surprising semantics.

### 4.3 Child-write parent-lock trigger [#10]
`BEFORE INSERT OR UPDATE OR DELETE` on `invoice_lines`, `invoice_extra_columns`, `invoice_line_fees`:
- Resolve the parent invoice id (for `invoice_line_fees`, via its line).
- `SELECT status INTO s FROM invoices WHERE id = $parent FOR NO KEY UPDATE;`
- `IF NOT FOUND` → allow (cascade path: the parent row was already deleted in this transaction, and §4.1's delete guard proved it was a draft).
- `IF s <> 'draft'` → `RAISE EXCEPTION`.
This closes REVIEW_REPORT S-3: the lock conflicts with `issue_invoice()`'s `FOR UPDATE`, so a draft edit and an issue serialize — an edit can no longer slip between the recompute and the commit, and frozen totals always match the stored lines. Task 1.2a must include the concurrency test: issue racing a line edit → exactly one wins.

## 5. RLS matrix [#12]

All tables RLS-enabled. Policies call a single helper `app_role()` — `SECURITY DEFINER`, `search_path` pinned — which returns the caller's role from `profiles` **only if `is_active = true`** (R-9.3: a deactivated user's live JWT gets nothing, even via direct PostgREST, which middleware never sees). Identity always from the server-verified session (`auth.uid()`) — never from client-supplied parameters (CLAUDE.md §4).

| Table | anon | staff | admin |
|---|---|---|---|
| settings | — | SELECT | SELECT; UPDATE via admin-guarded server action |
| profiles | — | SELECT (name/role, for display) | SELECT / INSERT / UPDATE |
| customers | — | SELECT; INSERT; UPDATE (non-deleted) | + UPDATE `deleted_at` (soft delete) |
| services | — | SELECT | + INSERT / UPDATE (incl. soft delete) |
| payment_methods | — | SELECT | + INSERT / UPDATE |
| invoices | — | SELECT; INSERT; UPDATE **only** `status='draft'` | same as staff — issue/void flow through SECURITY DEFINER functions, never raw UPDATE |
| invoice_lines / invoice_extra_columns / invoice_line_fees | — | SELECT; INSERT/UPDATE/DELETE only while parent draft (trigger §4.3 backstops) | same |
| payments | — | SELECT; INSERT | SELECT; INSERT (reversals are inserts) — **no UPDATE/DELETE for anyone** |
| invoice_events | — | SELECT; INSERT | SELECT; INSERT — **no UPDATE/DELETE for anyone** |
| invoice_counters | — | none | none (function-only) |

Service-role key policy (REVIEW_REPORT S-5.4): **never used for ordinary reads/writes in server actions** — user-scoped clients only; the service key is reserved for rare, explicitly-justified admin operations. VERIFY at task 1.3: PostgREST exposure of the `public` schema matches this matrix and nothing more.

## 6. Derived payment status [#8]

Computed at read time — never stored:

```sql
CREATE VIEW invoice_list AS
SELECT i.*,
       COALESCE(p.paid, 0) AS paid_total,
       CASE
         WHEN i.status <> 'issued' THEN NULL
         WHEN COALESCE(p.paid, 0) = 0 THEN 'unpaid'
         WHEN COALESCE(p.paid, 0) >= i.grand_total THEN 'paid'
         ELSE 'partial'
       END AS payment_status
FROM invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM payments WHERE invoice_id = i.id
) p ON true;
```

Rationale (REVIEW_REPORT S-8): trivially fast at this scale (~18k invoices over 5 years); insert-only payments make the sum drift-proof; the rejected trigger-rollup alternative would force the §4.1 matrix to whitelist writes to issued rows — widening the attack surface on the system's headline guarantee. `overdue` is a pure display predicate (`due_date < today AND payment_status <> 'paid'`), driven by `settings.due_days_default` until Q-11 answers. Overpayment (`paid_total > grand_total`) still reads `paid` — the UI flags it; it is not an error state.

## 7. JS/serialization boundary (REVIEW_REPORT S-7, ADJUDICATION R-7)

Drizzle maps all fils columns with bigint **`mode: 'number'`** (values sit far below 2^53), normalized once at the data layer — no JS `bigint` ever reaches `JSON.stringify`, no Superjson dependency. User input parses string → fils with rejection of >2 decimals; display formats from integer math. Task 1.1 done-criteria include a round-trip test of a large fils value through a server action.

## 8. Deliberately out of schema

- No `paid_amount` on invoices (D-14). No multi-tenancy columns. No PDF storage (D-09). No credit-note table — void + `replaces_invoice_id` covers MVP; raise as a client question if formal credit notes surface. No Arabic columns until Q-08 answers (REVIEW_REPORT §5.4 — `text` is already Unicode; a "yes" lands on the print template, not migrations).

## 9. Open items

The four v1 §6 items are **resolved** (payment status §6; snapshot+FK with NOT NULL §2.6/2.3; RLS matrix §5; Arabic §8) per REVIEW_REPORT §5 and ADJUDICATION. Remaining open items live in DECISIONS.md: the Q-register (client) and the VERIFY register (accountant, ~1 hour, before Phase 6 sign-off) — including the two items awaiting Mushtaq: year-duplicate `INV-NN` display acceptability (§2.6 numbering) and the D-09 thermal-reopen rule.
