# REVIEW_REPORT.md — Pre-build Review of the Invoice System Planning Package

**Reviewer:** Claude (Fable 5), Plan Mode session per REVIEW_PROMPTS.md PROMPT 1
**Date:** 2026-07-04
**Documents reviewed (in order, fully):** CLAUDE.md · PROJECT_PLAN.md · DECISIONS.md · SCHEMA_DESIGN.md · BUILD_PHASES.md · `invoice_system_v2.html` (2,844 lines — tokens, all renderers, full calculation logic, demo data, issue flow)

**Conventions used here:** findings are numbered (C-x contradictions, S-x schema, F-x compliance, B-x build plan, R-x risks) so the Codex cross-check can reference them. Anything I cannot verify from the documents alone — especially UAE FTA specifics and current Supabase behavior — is marked **VERIFY**. Challenges to locked D-items are labeled **[challenges a locked decision]**.

---

## 1. Contradictions

### C-1 · Extra charges: per-line dynamic *columns* (prototype + D-11) vs flat per-invoice *rows* (schema) — the biggest structural disagreement

- **Prototype** (`invoice_system_v2.html` ~line 1401): `// New line item shape: { desc, qty, fees: { columnId: amount } } — Columns are stored per-invoice so each invoice can have its own extra columns`. Demo invoice INV-153 has a per-line `courier: 25` fee that `calcInvoice()` multiplies by the line's `qty: 5` → 125.
- **DECISIONS.md D-11:** "Dynamic per-invoice extra **columns**, each with its own VAT-ability toggle." (Column language — matches the prototype.)
- **SCHEMA_DESIGN.md §2.6** `invoice_extra_charges`: "`invoice_id`, `position integer`, `label text`, `amount bigint`, `vatable boolean`" — a flat list of invoice-level charges. No per-line association, no qty participation, no column concept.

These are materially different data models. The schema as written cannot render the approved UI (a fee-column grid where each line has a value in each column), and the UI cannot be represented in the schema without lossy flattening. **Ruling: the prototype + D-11 win** — the prototype was verified against a real client invoice and D-11 is locked with "columns" language. The schema must change: add `invoice_extra_columns` (invoice_id, label, vatable, position) and store per-line values either as a jsonb `extra_fees` on `invoice_lines` or a junction table `invoice_line_fees (line_id, column_id, amount_fils)`. I recommend the junction table (queryable, constrainable). This must be resolved before task 1.1 — it changes three tables.

### C-2 · `invoice_lines` has no `qty` — but the verified calculation multiplies everything by qty

- **Prototype** `calcInvoice()` (line ~1546): `const amount = qty * (it.fees?.[col.id] || 0)`, and the preview prints a Qty column. Demo lines like "Residency Visa Renewal — 2 employees, qty 2 × 1100".
- **SCHEMA_DESIGN.md §2.5** `invoice_lines`: `position, description, govt_fee, service_fee` — no quantity, and the fee columns are ambiguous between unit price and line total.

**Ruling: prototype wins.** Add `qty integer not null default 1 check (qty > 0)` and define `govt_fee`/`service_fee` explicitly as **unit** fees in fils. Without qty the print layout cannot match the approved invoice, and FTA full tax invoices require unit price and quantity (see F-1, VERIFY).

### C-3 · The `services` catalogue exists in the prototype and BUILD_PHASES but not in the schema

- **Prototype:** an entire "Service catalogue" page (`renderServices()`, 13 seeded services with govt/service unit fees), plus the invoice form's "From service catalogue" picker.
- **BUILD_PHASES.md task 1.4:** "Seed script: settings row, admin user, demo customers + **services** matching prototype demo data."
- **SCHEMA_DESIGN.md:** 9 tables, none of which is a services/catalog table. PROJECT_PLAN §5 confirms "Data model: 9 tables."

Task 1.4 seeds rows into a table that does not exist, and no BUILD_PHASES task builds the catalogue management UI. **Ruling: schema is missing a table.** Add `services (id, name, govt_fee bigint, service_fee bigint, unit text, is_active boolean, deleted_at)` and add a build task for the catalogue page (see B-4).

### C-4 · Prototype violates the VAT-snapshot invariant (D-16) — its calculation must NOT be ported as-is

- **CLAUDE.md §3.3:** "VAT rate and VAT-registration state are **snapshotted onto the invoice at issue time**. Never compute an issued invoice's VAT from current Settings."
- **Prototype** `calcInvoice()` (line ~1565): `const total = subtotal + (company.vatRegistered ? vat : 0)` — reads the **live** Settings flag for every invoice, including issued ones. `invoiceTotal(inv)` routes all list/dashboard amounts through it. Toggling VAT in the prototype's Settings retroactively changes the displayed totals of every issued invoice (e.g., INV-154's total flips between 802.20 and 800.00 while its `paid: 802.20` stays fixed).

**Ruling: the documents win, unambiguously.** This matters because BUILD_PHASES 0.3/4.x say to port from the prototype: the prototype's arithmetic *formula* is correct; its *data flow* (live settings, hardcoded `0.05`, floats) is exactly what D-16 and §3.3 forbid. The real system must render issued invoices exclusively from stored totals + snapshots.

### C-5 · The prototype's demo data contradicts its own calculation logic — do not use it as test fixtures

The claim "calculation logic was verified against a real client invoice" holds for `calcInvoice()` on the simple cases (INV-154: 756 + 44 + 2.20 VAT = 802.20 ✓; INV-152: 300 + 50 + 2.50 = 352.50 ✓), but three demo records are internally inconsistent:

1. **INV-153:** items = qty 5 × {govt 300, service 80, courier 25 (non-VATable)} → 1500 + 400 + 125 = 2025 subtotal + 20 VAT = **2045.00**. The record says `paid: 2025.00, status: 'paid'` and the audit log says "AED 2,025" — the payment misses the VAT by exactly 20, yet the status is 'paid'.
2. **INV-151:** qty 3 × {270, 70} → 810 + 210 + 10.50 = **1030.50**; audit log says "AED 1,072.50".
3. **INV-150:** qty 2 × {200, 80} → 400 + 160 + 8 = **568.00**; audit log says "AED 588".

**Ruling:** the calc function wins; the hand-typed demo data is wrong. BUILD_PHASES 1.4 says to seed "demo customers + services matching prototype demo data" — fine for customers/services, but **never** copy the invoice/payment amounts into tests: they would bake in three arithmetic errors. Incidentally, INV-153 ('paid' while underpaid by 20) is a live demonstration of why D-14 derives status from the payments sum instead of storing it.

### C-6 · Issue flow: no confirm step in the prototype (documented supersession — carried here for completeness)

**CLAUDE.md §5 / D-23:** "Issuing an invoice always shows a mandatory preview + 'Confirm & Issue' step before sealing," slide-over drawer, "NOT a permanent split view." **Prototype:** `$('#issue-invoice').onclick` calls `issueInvoice()` immediately, and the layout is a permanent split view (`new-inv-grid` with `preview-doc`). D-23 is dated 2026-07-04 and explicitly supersedes the prototype — no action needed beyond not copying the prototype's flow.

### C-7 · MFA: prototype presents it as optional; the docs require it for admin

**Prototype** Settings (~line 2476): "Two-step verification (optional) … can be turned on anytime later," and the Employees page says accounts have "optional 6-digit phone verification." **CLAUDE.md §2 / D-06 / D-19:** "TOTP MFA required for the admin role." **Ruling: docs win.** Flag so the Settings/Employees screens aren't rebuilt from prototype copy — the prototype's security card text is wrong in three ways (optional MFA, "6-digit phone" implying SMS, and a "30-minute auto-logout" nobody has specified elsewhere).

### C-8 · Prototype copy says staff cannot issue; the role matrix and the prototype's own data say they can

**Prototype** invoices page (~line 1815): "You may view any invoice but only the owner can void or **seal**." **CLAUDE.md §4 / D-19:** staff *can* create and issue invoices; they cannot void/credit, manage users, or change Settings. The prototype's own demo data agrees with the docs (INV-156/155/154/152/150 all issued by staff u2–u4). **Ruling: docs + demo data win; the editorial sentence is wrong.** Also standardize vocabulary: "sealed" should mean **issued/immutable**, yet the status label "Paid · sealed" (D-22) attaches it to payment state — an issued-unpaid invoice is equally sealed. Keep the label if the client likes it, but the UI must not imply unpaid invoices are editable.

### C-9 · `/reference/invoice_system_v2.html` does not exist

CLAUDE.md, PROJECT_PLAN.md and REVIEW_PROMPTS.md all cite `/reference/invoice_system_v2.html`; the file actually sits at the repo root. Trivial: move the file into `/reference/` (or fix three docs) before Phase 0 so session-start instructions don't dead-end.

### C-10 · `payments.method` CHECK constraint hardcodes an open question

**SCHEMA_DESIGN §2.7:** `method text not null check (method in ('cash','card','bank_transfer','cheque')) (finalize per Q-10)` — while **CLAUDE.md §6** says "Anything plausibly client-variable … goes in Settings or config, not hardcoded." A CHECK constraint is the most hardcoded option available and each change is a migration. **Ruling: CLAUDE.md wins** — drop the CHECK; validate the method list in zod against a Settings-stored array (a bad method value is not a financial-integrity threat; the constraint buys little).

### C-11 · Money storage: "fils integers **or numeric**" (CLAUDE.md) vs "fils as bigint — never floats" (schema)

CLAUDE.md §3.3 permits `numeric`; SCHEMA_DESIGN locks bigint fils. Not a functional conflict — the schema refines the rule — but the "or" invites a future session to mix representations. **Ruling: tighten CLAUDE.md** to "bigint fils only" so both documents state one representation.

### C-12 · Immutability enforcement: "trigger **or** RLS policy" (CLAUDE.md) vs "privileges AND triggers" (PROJECT_PLAN)

**CLAUDE.md §3.1:** "database (trigger **or** RLS policy blocking UPDATE …)". **PROJECT_PLAN §7:** "append-only enforcement via both privileges and triggers." The "or" is dangerous: RLS is bypassed by `service_role` and by anyone in the Supabase dashboard, so RLS-only enforcement is a paper wall (see S-6). **Ruling: PROJECT_PLAN wins; edit CLAUDE.md** to require a trigger, with RLS and privileges as additional layers, never alternatives.

### C-13 · Prototype audit page invents a 12-month archival policy

Prototype audit page: "Records older than 12 months are archived but never deleted." No document specifies any archival mechanism, and FTA retention argues against moving records anywhere for 5+ years. **Ruling: drop the sentence**; events stay in `invoice_events` indefinitely (trivial volume: ~300 invoices/month × a handful of events).

### Checked and fine (one line each)

- Table count (9) consistent between PROJECT_PLAN §5 and SCHEMA_DESIGN §1 — though C-1/C-3 will change it.
- Design tokens in the prototype match D-20 exactly (`#f6f5f2`, `#0a0d12`, `#003b5c`/`#5b95c4`, `#c2410c` for overdue only) — port as-is.
- Role matrix is consistent across CLAUDE.md §4, D-19, and PROJECT_PLAN §3.
- Fonts per D-21 (Inter Tight + JetBrains Mono, no serif) — the prototype complies, including tabular-nums.
- 30/40/40 payment structure, demo milestone definition, and the phase gate are consistent between PROJECT_PLAN §9 and BUILD_PHASES sequencing rules (but see B-1 on what "print" means at the demo).
- Prototype numbering `INV-` + `padStart(2)` matches `INV-{NN}` format including >99 overflow behavior.

---

## 2. Schema critique

### S-1 · The counter upsert, as specified, numbers the first invoice of every year **0**

**SCHEMA_DESIGN §3 step 3:** `INSERT INTO invoice_counters(year) VALUES ($yr) ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1 RETURNING last_number`.

Walk through January 1st: no row for the year exists → the INSERT succeeds (no conflict) → `last_number` takes its default **0** → `RETURNING last_number` returns **0** → the first invoice of every year is INV-00, and the second is INV-01. The `DO UPDATE` branch only fires on conflict. **Fix:** `INSERT INTO invoice_counters(year, last_number) VALUES ($yr, 1) ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1 RETURNING last_number`. Task 1.2's test suite must include "first invoice of a fresh year gets sequence 1."

### S-2 · Gaplessness and duplicate-safety of the counter: **confirmed**, with the locking walk-through requested

Under READ COMMITTED, `INSERT … ON CONFLICT DO UPDATE` locks the conflicting row before the UPDATE and re-reads the latest committed value — two concurrent issuers cannot both read the same `last_number`; the second blocks on the row lock until the first commits or aborts. Because the increment happens **inside** the issue transaction, any failure after increment (crash, constraint violation, timeout) rolls the counter back with everything else → no gap, no orphaned number. Lock ordering: each issuer locks (1) its own invoice row (distinct per issuer), then (2) the shared counter row — the shared resource is always acquired last and in the same order, so the classic deadlock shape doesn't arise. The counter row is a global serialization point for issues, which is fine at ~15 invoices/day. Two staff clicking Issue on the *same* draft: the second blocks at step 1's `FOR UPDATE`, then sees `status='issued'` and must abort — the spec's "verify status='draft'" check happens **after** lock acquisition, which is correct as written.

### S-3 · The real race hole: a draft edit racing `issue_invoice()` can produce frozen totals ≠ stored lines

The issue transaction locks the **invoice header** row (`SELECT … FOR UPDATE`), but `invoice_lines` / extra-charge rows are **not covered by that lock**. Sequence: (1) issuer locks header, recomputes totals from lines; (2) a concurrent staff session UPDATEs a line — the immutability trigger on lines checks the parent's status, sees the **committed** value `'draft'` (the issuer hasn't committed), and allows it; (3) both commit. Result: an issued, immutable invoice whose stored `grand_total` was computed from lines that no longer exist in that form. This is the worst kind of financial bug — silent, and sealed by your own immutability machinery.

**Fix (required, cheap):** every write path to `invoice_lines` / extra-charge rows must first take the parent invoice row lock (`SELECT 1 FROM invoices WHERE id = $1 AND status = 'draft' FOR UPDATE` at the top of the server action / or a `BEFORE INSERT/UPDATE/DELETE` trigger on the child tables that does `SELECT … FOR KEY SHARE`→ insufficient; it must be `FOR NO KEY UPDATE` or stronger to conflict with the issuer's `FOR UPDATE`). Simplest robust form: a trigger on the child tables that re-selects the parent `FOR NO KEY UPDATE` and rejects unless `status='draft'`. Task 1.2's "done" criteria must add a concurrency test: issue racing a line edit → exactly one wins, never both.

### S-4 · Numbering collision across years — the global `unique` breaks in year 2 **[touches locked D-12]**

**SCHEMA_DESIGN §2.4:** `invoice_number text null unique`. **D-12:** numbers reset each January, format `INV-{NN}` with **no year component** ("do not override with INV-YYYY-NNNN"). Therefore January 2028's INV-01 collides with January 2027's INV-01 and the first issue of the second year **fails on the unique constraint** — a guaranteed production incident on New Year's week.

**Fix that respects D-12:** store `number_year integer` + `number_seq integer` with `unique (number_year, number_seq)`; keep `invoice_number` as display text **without** a unique constraint. The client keeps INV-NN. Note the residual compliance question: FTA requires "a sequential Tax Invoice number or a unique number" — whether visually duplicate numbers across years (distinguished only by date) are acceptable is **VERIFY** with the client's accountant. If the answer is no, D-12's no-year format needs revisiting **[challenges a locked decision — needs Mushtaq's approval, not mine]**.

### S-5 · Immutability: write-path enumeration for `invoices` / lines / extra charges

1. **App server actions (draft edits).** Guarded by RLS ("UPDATE only on draft") + the immutability trigger. Safe **only if** S-3's parent-lock rule is adopted.
2. **`issue_invoice()` / void function (SECURITY DEFINER).** Safe by design, but two specification gaps: (a) SECURITY DEFINER functions in Supabase must pin `search_path` (`SET search_path = public, pg_temp`) or a malicious/mistaken schema shadow can hijack referenced objects — VERIFY current Supabase linter guidance, but pinning is standard; (b) the trigger spec says it rejects changes "except the allowed transitions … executed by security-definer functions" without saying **how the trigger knows the caller**. Postgres triggers can't see "which function is running." Concrete options: the trigger validates the *shape* of the change rather than the caller — allow `draft→issued` only when exactly {status, invoice_number, number_year, number_seq, totals, snapshots, issued_by, issued_at} change and OLD values were NULL; allow `issued→voided` only when exactly {status, voided_by, voided_at, void_reason} change; reject every other UPDATE where any financial column differs. Write this column-transition matrix into SCHEMA_DESIGN — it is the actual security boundary.
3. **Cascade delete.** §2.5: `on delete cascade` with the comment "cascade applies to drafts only; issued invoices can't be deleted at all" — enforced by **nothing** as written. RLS DELETE policies don't stop cascades or service_role. Add a `BEFORE DELETE` trigger on `invoices` raising unless `status='draft'`.
4. **Supabase dashboard / `service_role`.** Bypasses RLS **and** table privileges are typically wide. Triggers still fire — which is why C-12's ruling (trigger mandatory) matters. Also adopt a code rule: the service-role key is never used for ordinary reads/writes in server actions; user-scoped clients only, service key reserved for the rare admin task. VERIFY: PostgREST exposure — confirm the `public` schema tables aren't reachable with elevated grants beyond what RLS intends (Supabase exposes everything in `public` via PostgREST by default).
5. **Postgres superuser** (Supabase SQL editor as owner) can `ALTER TABLE … DISABLE TRIGGER`. Unfixable at this tier; accept as residual risk, mitigated by the append-only event log + daily backups + single-admin discipline. Say so in the runbook rather than pretending otherwise.

### S-6 · Append-only enforcement for `invoice_events` and `payments`: currently half-aspirational

**SCHEMA_DESIGN §2.8** offers "`CREATE RULE` or trigger" — RULES are a deprecated-in-practice legacy mechanism with surprising semantics; use a trigger. **§2.7 payments:** "Insert-only: revoke UPDATE/DELETE from app roles" — privileges alone don't bind `service_role` or dashboard users. The real recipe, for **both** tables: (1) `REVOKE UPDATE, DELETE ON … FROM anon, authenticated`; (2) RLS enabled with **no** UPDATE/DELETE policies for any role; (3) a `BEFORE UPDATE OR DELETE` trigger that unconditionally raises. Three layers, all cheap. Additionally missing on `payments`: `reverses_payment_id uuid null references payments` (without it, reversal rows can't be paired to their originals in the ledger, CSV export, or an audit) and `check (amount <> 0)`.

### S-7 · Money flow and rounding — the plan never says where VAT rounds

Unit consistency: fils bigint from form → draft → issue → payments → CSV is consistent *in the schema docs*; the prototype is floats with display-time rounding (`toLocaleString`) and a hardcoded `0.05` — porting its formula requires re-derivation in integer math, not translation.

**Where VAT rounds:** nowhere specified. UAE FTA's published position is that the tax amount on a tax invoice may/must be rounded **to the nearest fils on a line-item basis** (commonly cited from the Executive Regulations' Art. 59/60 area) — **VERIFY the exact current provision before Phase 1 sign-off; do not trust this from memory.** Compliant concrete approach: per vatable component, `vat_line = round_half_up(unit_fee_fils × qty × vat_rate_bp / 10000)`; invoice `vat_amount = Σ vat_line`; grand total = subtotal + vat_amount. Consequences for the schema: store the frozen per-line VAT (`invoice_lines.vat_amount bigint`, and per extra-charge value) at issue — if you only store the invoice-level VAT, a future print/render can re-derive per-line VAT with a different rounding and disagree with the sealed total forever.

JS boundary notes: Postgres `bigint` arrives as a string through several drivers; pick Drizzle's bigint `mode: 'number'` (fils totals here are far below 2^53) and normalize once at the data layer; CSV export writes `(fils/100)` with exactly two decimals; display formatting derives from integer division, never `parseFloat` on user input × 100 (use string→fils parsing that rejects >2 decimals).

### S-8 · Derived `payment_status` — resolution of SCHEMA_DESIGN §6 item 1

**Decision: compute at read time (view/join); do not store.** Concretely: `invoice_list` view (or a Drizzle query) with `LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = i.id)` and a CASE deriving unpaid/partial/paid; index `payments (invoice_id)` (already implied by the FK — make it explicit). Justification: (a) at 300 invoices/month, the aggregate over even 5 years (~18k invoices, ~25k payments) is milliseconds; (b) the alternative — a trigger-maintained `paid_total` on `invoices` — requires the immutability trigger to whitelist UPDATEs to `paid_total` on **issued** rows, widening the attack surface on the exact property the system stakes its reputation on (PROJECT_PLAN §1); (c) insert-only payments means the sum cannot drift. `overdue` remains a pure display predicate (`due_date < today AND status ≠ paid`) — blocked on due-date conventions (Q-11–17), see B-6. Revisit with a materialized rollup only if list p95 measurably degrades.

### S-9 · Walk-in customers: `customer_id null` leaves the draft's counterparty nameless

**§2.4:** "`customer_id uuid null` — null allowed for pure walk-in (name captured below)" — but nothing below captures it: `customer_snapshot` is populated **at issue** from the customer record, so a draft for an ad-hoc walk-in has the customer's name **nowhere**. The prototype instead quick-creates a customer (`Add "<name>" as new customer` in the picker; a "Quick add walk-in" button on the Customers page). **Resolution (also §6 item 2):** make `customer_id NOT NULL`; the walk-in flow always quick-creates a minimal `customers` row (name only, `type='walk_in'`). This simplifies RLS, the ledger view, and global search, and eliminates a nullable-FK special case from every query.

### S-10 · Missing tables/columns — consolidated list for task 1.1

| # | Missing | Needed by |
|---|---|---|
| 1 | `services` table + catalogue CRUD | Prototype page, task 1.4 seed, 4.1 picker (C-3) |
| 2 | `invoice_lines.qty` (+ fees defined as unit fees) | Verified calc, print layout, FTA unit-price field (C-2) |
| 3 | Extra-charges remodel: `invoice_extra_columns` + per-line values | C-1 / D-11 |
| 4 | `invoices.notes text`, `invoices.terms text` (+ `settings` defaults for both) | Prototype prints notes & payment terms; REVIEW_PROMPTS explicitly asks |
| 5 | `settings.bank_details text`, `settings.tagline text` | Prototype invoice footer prints bank line; header prints tagline |
| 6 | `payments.reverses_payment_id`, `check (amount <> 0)` | S-6 |
| 7 | `invoice_lines.vat_amount bigint` (frozen at issue; likewise for extras) | S-7 rounding integrity; FTA per-line tax **VERIFY** |
| 8 | `invoices.number_year int`, `number_seq int`, `unique(number_year, number_seq)`; drop global unique on display text | S-4 |
| 9 | `invoices.replaces_invoice_id uuid null` | Void + replacement flow (4.4) — links replacement to voided original for the audit story |
| 10 | GIN trigram **expression index** on `(customer_snapshot->>'name')` | Global search must find issued invoices by walk-in name after the customer record changes; the customers.name trigram alone misses snapshots |
| 11 | `invoices.supply_date date null` | FTA "date of supply if different from issue date" — **VERIFY** (F-1) |

Also noted: the `'printed'` event (§2.8 event_type list) can only ever be "print requested" — the browser cannot confirm a print completed or was cancelled; document it as best-effort so nobody later "fixes" it into a false guarantee.

---

## 3. Compliance check

Everything here that states an FTA rule is **VERIFY** unless it's pure design logic — per the session rules I am deliberately not trusting memory for current FTA specifics. A UAE accountant (or the FTA's published guides) must confirm F-1–F-5 before Phase 6 print sign-off.

### F-1 · Mandatory fields on a full tax invoice — schema coverage matrix (**VERIFY** the authoritative field list, Executive Regulation Art. 59 area)

| Requirement (as commonly stated) | Covered? |
|---|---|
| "Tax Invoice" clearly displayed | ✅ Prototype title switches per `vat_registered` snapshot |
| Supplier name, address, TRN | ✅ `settings` + snapshot at issue |
| Recipient name & address (and TRN where registered) | ⚠️ `customer_snapshot` — must be **required** to include address/TRN for regular VAT-registered customers; walk-ins fall under simplified invoices (F-2) |
| Sequential or unique invoice number | ⚠️ S-4 collision bug; annual-reset duplicates **VERIFY** |
| Date of issue | ✅ `issue_date` |
| Date of supply, if different | ❌ No column — add `supply_date` (S-10 #11), **VERIFY** if required |
| Description of goods/services | ✅ `invoice_lines.description` |
| Unit price, quantity, rate of tax, tax amount per line | ⚠️ qty missing (C-2); per-line VAT not stored (S-7); rate is invoice-level snapshot — acceptable if uniform 5%, **VERIFY** presentation requirement |
| Discounts offered | ⚠️ No discount concept anywhere — Q-11–17 includes "discount handling"; until answered, absence is a known gap, not an oversight |
| Gross amount payable in AED | ✅ `grand_total`, AED-only system |
| Tax amount payable in AED | ✅ `vat_amount` |

### F-2 · Full vs **simplified** tax invoice — the distinction is absent from the design

UAE VAT allows a simplified tax invoice (fewer fields, no recipient details) where the recipient is unregistered or consideration is below a threshold (commonly cited AED 10,000) — **VERIFY threshold and conditions**. The walk-in flow will produce mostly simplified-eligible invoices; regular business clients need the full format. Neither the schema nor the print task (6.1) mentions two formats. Cheap resolution: one print template with conditional blocks (recipient section renders only when snapshot has details), plus a rule that invoices to TRN-holding customers must have complete snapshots. Flag to the accountant which format the client must issue per customer class.

### F-3 · 5-year retention: "Supabase Pro daily backups" is **not** a retention mechanism

PROJECT_PLAN §2/§7 and D-06 equate Pro-tier daily backups with FTA 5-year retention. Two different things: the **live database** satisfies retention for as long as the project exists and the subscription is paid; Pro daily backups are retained on the order of **7 days** (**VERIFY current Supabase terms**) and exist for disaster recovery, not archival. If the subscription lapses, the project is deleted, or the operator relationship ends badly (PROJECT_PLAN risk 5 — bus factor), records are gone. Cheap fix: a **monthly `pg_dump` exported to client-owned storage** (even a Google Drive the client controls) + a restore drill task (B-3). Reword D-06's rationale so nobody later "optimizes away" the export believing backups already cover the legal duty.

### F-4 · Deregistration behavior — design is correct; two edge cases to flag

The snapshot + template approach (D-16) correctly yields: post-deregistration invoices print as plain "Invoice", no VAT row, no TRN; historical tax invoices remain untouched. Two flags: (a) a **replacement invoice** (void+replace flow) created *after* deregistration for a VAT-era original cannot charge VAT — the corrective path for VAT-era mistakes post-deregistration likely requires accountant guidance (**VERIFY**); (b) the prototype's Settings hint ("Add your TRN here once your registration completes — invoices will automatically switch back") implies TRN persists through deregistration — keep `settings.trn` populated but unprinted while unregistered; don't null it.

### F-5 · Rounding rule

Stated and resolved in S-7: nearest-fils, line-item basis, half-up — **VERIFY the exact provision** and record the citation in SCHEMA_DESIGN once confirmed, so the rounding function has a legal anchor rather than folklore.

---

## 4. Build-plan critique

### B-1 · The demo milestone promises printing, but print CSS is built two phases later

**PROJECT_PLAN §9:** demo milestone (40% payment) = "client can create, issue, **preview/print**, and record payment" at end of Phase 4 + task 5.1. **BUILD_PHASES:** print CSS is task **6.1**, after the milestone; sequencing rule 3 says "create, issue, **print-preview**, and record payment." "Print-preview" (the drawer) and "print" (paper in hand) are different promises — and this client runs a shop that hands paper to walk-ins; at the demo he will press Ctrl+P. Whatever renders is the impression the 40% payment rides on. **Fix:** add a minimal print stylesheet to task 4.2's scope (readable A4, not pixel-final), leaving 6.1 as the pixel-honest pass. Cost: ~half a day; insurance on 40% of the fee.

### B-2 · The prototype contains **zero** print CSS — task 6.1's "port from prototype" premise is false

There is no `@media print` and no `window.print()` anywhere in `invoice_system_v2.html` (checked). The approved artifact approves the *screen* look of the preview only. 6.1 starts from a blank page for the physical layout (margins, page-break rules, header repetition, fonts-at-print-time) — size it as a real task, not a port, and note Q-07 (paper size) plus Q-08 (Arabic) both land directly on it.

### B-3 · Missing tasks

1. **Staging environment.** No second Supabase project or preview-deploy wiring exists anywhere — so untested migrations hit the production financial DB. Add to Phase 0: staging Supabase project + Vercel preview envs + migration-drill workflow. This is the cheapest insurance in the whole plan.
2. **Backup/restore drill** (also F-3): restore latest backup + monthly export into scratch project, verify an invoice's integrity. Phase 7, ~2 hours, and it converts the FTA retention claim from aspiration to tested fact.
3. **Services catalogue CRUD page** (C-3): admin-editable catalogue per prototype's Services page. Phase 3 (suggest 3.3).
4. **Uptime monitoring**: a free pinger + Sentry alert rules; Phase 7. The operator is solo and asleep in a different timezone than the shop's 8am.
5. **TOTP recovery codes / admin lockout runbook**: 2.1 enforces TOTP for admin but nothing covers a lost phone. Locked-out owner = the system's single point of administrative failure.
6. **Resend/email**: in the stack (D-08, Phase 0.2 keys) and in the events enum (`'emailed'`), but **no task sends any email** and MVP scope (PROJECT_PLAN §3) doesn't list invoice emailing — while "email sending needs" sits unanswered in Q-11–17. Either add a ⛔-blocked task or drop Resend from Phase 0 setup; wiring keys for a feature with no task is drift by construction.

### B-4 · Tasks too large for one session

- **1.2** bundles `issue_invoice()` + immutability triggers + append-only enforcement + the full concurrency test suite — after this review it also absorbs S-1/S-3/S-4 fixes. Split: **1.2a** issue function + numbering + gapless/concurrency tests; **1.2b** immutability trigger matrix + append-only triggers + delete guards + their tests.
- **4.1** bundles the dynamic-column line grid (the hardest UI in the app, per C-1's junction model) + catalogue picker + customer picker + draft persistence + live totals. Split: **4.1a** line-items grid + totals; **4.1b** pickers + draft save.

### B-5 · Dependency-order notes

- 2.3 builds global search scaffold before customers (3.1) exist — acceptable as scaffold, just don't promise it works until 3.1 lands.
- 1.4 (seed) depends on the services-table decision (C-3) — currently seeds into a nonexistent table.
- 5.1's "overdue rendering in burnt orange" silently depends on due-date conventions (Q-11–17: "invoice due-date conventions") but carries no ⛔ marker — add ⛔ Q-11 to 5.1, with a configurable default (e.g., due = issue date, overdue after Settings-configurable N days) so the demo isn't blocked.
- Session revocation (2.2): Supabase JWTs remain valid until expiry even after `auth.admin.signOut(userId)` — with default 1-hour access tokens, "revoked" staff keep working for up to an hour unless every request also checks `profiles.is_active` (CLAUDE.md already requires this — good) **and** the access-token TTL is shortened (~10 min) in Supabase config. Add the TTL change + a "revoked user is locked out within N minutes" acceptance test to 2.2. **VERIFY** current Supabase revocation semantics.

### B-6 · MVP scope verdicts

Nothing in MVP deserves cutting — realtime (6.3) is genuinely load-bearing for a 6-person shared ledger, and CSV export is the accountant's lifeline. The only scope *additions* this review forces are the services catalogue (C-3, already implied by the prototype) and minimal-print-at-demo (B-1). The emailing question (B-3.6) should resolve toward **out** of MVP unless Q-11–17 answers demand it.

---

## 5. Resolutions (SCHEMA_DESIGN §6 open items)

1. **Derived vs trigger-maintained `payment_status` → derive at read time via a view/join.** Full reasoning in S-8: trivial cost at this scale; the trigger-rollup alternative forces the immutability trigger to whitelist writes to issued rows, weakening the system's headline guarantee; insert-only payments make the computed sum drift-proof.
2. **`customer_snapshot` vs FK → both, and make the FK NOT NULL.** Snapshot is the legal document content, frozen at issue; FK is the ledger/history spine. Eliminate the `customer_id null` walk-in path by quick-creating a minimal customer row (S-9) — the prototype already behaves this way.
3. **Exact RLS policies → write this matrix into SCHEMA_DESIGN §4:**

   | Table | anon | staff (authenticated, role=staff) | admin |
   |---|---|---|---|
   | settings | none | SELECT | SELECT; UPDATE via admin-guarded server action |
   | profiles | none | SELECT (name/role only, for display) | SELECT/INSERT/UPDATE |
   | customers | none | SELECT; INSERT; UPDATE (non-deleted) | + UPDATE `deleted_at` (soft delete) |
   | services | none | SELECT | + INSERT/UPDATE |
   | invoices | none | SELECT; INSERT; UPDATE **only** `status='draft'` rows | same as staff — issue/void go through SECURITY DEFINER functions, not raw UPDATE |
   | invoice_lines / extra columns+values | none | SELECT; INSERT/UPDATE/DELETE only while parent `status='draft'` (trigger-enforced parent lock, S-3) | same |
   | payments | none | SELECT; INSERT | SELECT; INSERT (reversals are inserts) — **no UPDATE/DELETE for anyone** |
   | invoice_events | none | SELECT; INSERT | SELECT; INSERT — **no UPDATE/DELETE for anyone** |
   | invoice_counters | none | none (function-only via SECURITY DEFINER) | none |

   Plus: revoke-and-trigger backstops per S-6; service-role usage policy per S-5(4); all policies keyed on a `profiles.role` lookup (or custom JWT claim — decide in 1.3 and test both roles per the task's done-criteria).
4. **Arabic (Q-08) → agree with the draft: no schema additions now.** `text` columns are already Unicode; the entire cost of a "yes" lands on the print template (RTL layout, font) — a task-6.1 concern, not a migration. Adding speculative `_ar` columns now would be building on an assumption, which CLAUDE.md §6 forbids.

---

## 6. Risk register — top 10 technical failure modes, cheapest mitigation for each

| # | Failure mode | Cheapest mitigation |
|---|---|---|
| 1 | **Year-2 numbering collision** (S-4): first January issue violates the unique constraint; invoicing halts on New Year's week | `(number_year, number_seq)` composite unique now; display text non-unique; test "issue across year boundary" in 1.2 |
| 2 | **Extras data-model mismatch** (C-1) discovered mid-Phase-4: schema can't represent the approved UI; emergency remodel of 3 tables with data already seeded | Resolve in this review; junction-table model into 1.1 before any migration exists |
| 3 | **Draft-edit/issue race** (S-3): sealed invoice whose totals ≠ its lines — silent, legally significant, sealed by your own trigger | Parent-row lock on all child writes; concurrency test in 1.2's done-criteria |
| 4 | **Counter first-value bug** (S-1): every January starts at INV-00 | One-line upsert fix + "fresh year → seq 1" test |
| 5 | **Immutability enforced only via RLS** — service_role/dashboard walk straight through | Trigger-based enforcement (C-12 ruling); column-transition matrix in schema doc; service-key usage policy |
| 6 | **FTA gaps ship to production** (F-1/F-2/F-5: simplified-invoice format, per-line VAT, rounding rule) and surface at the client's first tax audit | All VERIFY items to a UAE accountant before Phase 6 sign-off; ~1 hour of the client's accountant's time |
| 7 | **Retention myth** (F-3): subscription lapse or relationship breakdown destroys the only copy of 5-year records | Monthly pg_dump to client-owned storage + restore drill (B-3.2) |
| 8 | **Print CSS is the sole document path and it drifts across browsers/updates** — a shop that can't print invoices is a shop that calls at 8am | Pin the shop to one browser in the ops runbook; print smoke-test in the release checklist; document "Save as PDF" fallback path |
| 9 | **Admin TOTP lockout** — sole owner loses phone, no recovery codes, no second admin | Recovery codes at enrollment (B-3.5) + documented recovery runbook |
| 10 | **Revocation gap** (B-5): fired staff keep a valid JWT for up to an hour | Shorten access-token TTL + `is_active` middleware check (already planned) + lockout-time acceptance test |

---

*End of report. Per REVIEW_PROMPTS.md, this document now goes to the Codex cross-check (PROMPT 2) together with the six source documents; disagreements are adjudicated before any change is applied to SCHEMA_DESIGN.md / BUILD_PHASES.md / DECISIONS.md, and only then does Phase 0 begin.*
