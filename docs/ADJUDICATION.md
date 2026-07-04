# ADJUDICATION.md — Final Rulings on the Two Reviews

**Inputs:** REVIEW_REPORT.md (Claude Fable 5, Plan Mode) · CODEX_REVIEW.md (actually Gemini — ChatGPT was discarded for wandering; label kept for file continuity)
**Adjudicator:** Claude (claude.ai session with full project memory), 2026-07-04
**Note:** Gemini's "Top 5 Changes" section was truncated in transmission and was not considered.

Where both reviewers agree, the finding is accepted without re-argument (that covers ~85% of both documents). This file rules only on disagreements and Gemini's independent claims, then gives the final change list for Mushtaq's approval.

---

## Part 1 — Rulings on direct disagreements

### R-1 · Extra-charges model: junction table vs JSONB (C-1)
**Claude:** junction table `invoice_line_fees (line_id, column_id, amount_fils)`. **Gemini:** JSONB `extra_fees` on `invoice_lines`, calling the junction "over-engineered."

**Ruling: junction table (Claude).** Gemini's performance argument is moot at 300 invoices/month — "minimizes joins on the critical path" optimizes a path with no load. What actually decides it: (a) `issue_invoice()` computes totals **inside Postgres** — summing typed bigint columns with an FK to the column's `vatable` flag is clean SQL; extracting and casting JSONB values inside plpgsql is where silent type bugs live; (b) S-7 requires frozen **per-line, per-charge VAT amounts** at issue — natural as junction columns, awkward as parallel JSONB; (c) bigint typing, `NOT NULL`, and FK integrity are real constraints on money — JSONB gives none of them. JSONB would mirror the prototype's in-memory shape, but the prototype is a UI artifact, not a storage spec.

### R-2 · `payments.method` CHECK constraint (C-10)
**Claude:** drop the CHECK, validate via zod against a Settings array. **Gemini:** keep the CHECK; dropping DB constraints on a financial ledger is an anti-pattern (PostgREST/SQL-editor writes bypass zod).

**Ruling: both half right — use a `payment_methods` lookup table with an FK.** Gemini's core point is correct and matters: zod-only validation does not bind the Supabase dashboard, service-role scripts, or PostgREST — on a ledger, that's a real hole, and Claude's "a bad method value is not a financial-integrity threat" undersells CSV/VAT-report grouping corruption. But Gemini's fix (keep CHECK, migrate to change) hardcodes unanswered Q-10, which CLAUDE.md §6 forbids. The lookup table (`payment_methods: id, label, is_active`, seeded, admin-editable) gives DB-enforced integrity **and** runtime configurability with no migration. Schema change: `payments.method_id uuid not null references payment_methods`.

### R-3 · Gaplessness under READ COMMITTED (S-2) — **Gemini is wrong on the Postgres facts**
**Claude:** the counter-row upsert inside the issue transaction is gapless; aborts roll the increment back. **Gemini:** "Claude's assertion … is false"; aborted transactions lose the incremented value "permanently," like sequences; demands counter allocation "at the last millisecond" or `LOCK TABLE … IN EXCLUSIVE MODE`.

**Ruling: Claude is correct; Gemini's finding is rejected as a hallucination.** Gemini conflates two different Postgres mechanisms. **Sequences** (`nextval()`) are non-transactional and do leave gaps on rollback — that is precisely why this design uses a **counter row** instead. A row UPDATE is ordinary MVCC data: if the transaction aborts, the update never becomes visible, and the next issuer's `ON CONFLICT DO UPDATE` blocks on the row lock, then reads the last **committed** value. No gap is possible. Gemini's own wording ("the transaction ID was consumed and rolled back") is incoherent — txids have nothing to do with the counter's value. Its proposed `LOCK TABLE IN EXCLUSIVE MODE` would serialize harder than needed and add nothing.

**One kernel worth keeping:** ordering the counter upsert as the *last* step before the events insert shortens the window the shared row lock is held, improving concurrency slightly. Adopt as a free micro-optimization in the function body ordering — for throughput, not correctness. (SCHEMA_DESIGN §3 already places it late: step 3 of 6.)

---

## Part 2 — Rulings on Gemini's independent findings

### R-4 · Transaction timeout / connection-pool exhaustion — **mostly moot, one good rule extracted**
Gemini's scenario (transaction held open across app↔DB network latency, orphaned `FOR UPDATE` locks freezing invoicing) applies to **app-orchestrated** transactions: `BEGIN` from Drizzle, multiple round trips, `COMMIT`. The design has none of that — `issue_invoice()` is a single Postgres function, i.e., **one statement, one round trip**; the transaction opens and closes inside the database in single-digit milliseconds. Its "do the math in application memory, keep the DB transaction under 50ms" mitigation would *reintroduce* trust in app-computed totals, which D-16/CLAUDE.md deliberately forbid.

**Extracted rule (adopt):** add to CLAUDE.md — *"The draft→issued transition may only ever be executed by calling `issue_invoice()` as a single statement. Never reimplement it as an application-managed multi-statement transaction."* Also note: single function calls are safe through Supabase's transaction-mode pooler, so no connection-mode footgun.

### R-5 · Realtime + RLS evaluation cost — **accept, simplified**
Directionally real Supabase behavior (`postgres_changes` evaluates RLS per subscribed client per change), though Gemini overstates the impact at 10 users / 15 invoices a day. But the mitigation is cheap and aligns with Supabase's guidance favoring **Broadcast** over `postgres_changes`: emit a lightweight "invoices changed" broadcast (from the server action or a trigger), clients refetch through the normal RLS-checked query. Simpler than Gemini's tracking-table design, same effect. **Adopt for task 6.3; VERIFY current Supabase Realtime recommendation when the task starts.**

### R-6 · Server-action double-submit / idempotency keys — **mechanism wrong, UX kernel adopted**
Gemini claims a second concurrent "Confirm & Issue" passes the `status == 'draft'` guard before the row lock. Wrong as specified: SCHEMA_DESIGN §3 checks status **after** `SELECT … FOR UPDATE` (Claude's S-2 explicitly verified this ordering), so the second call blocks, re-reads `status='issued'`, and aborts. **No duplicate number is possible; no idempotency-key machinery is needed** — cryptographic idempotency keys with a distributed cache for a 10-user single-tenant app is severe over-engineering.

**Adopt the UX half:** task 4.2 must (a) disable the confirm button on first click, and (b) treat the "already issued" error as a *success-shaped* response (show the issued invoice) rather than an error toast — the user's intent was satisfied by the racing request.

### R-7 · BigInt JSON serialization — **already resolved by Claude's S-7; no Superjson**
The `JSON.stringify(BigInt)` TypeError is real, but only if Drizzle maps Postgres bigint to JS `bigint`. Claude's S-7 already prescribes `mode: 'number'` (fils totals sit far below 2^53 — a AED 90-trillion invoice is not this client's problem), normalized once at the data layer. That eliminates the serialization boundary entirely. Superjson/string-casting: rejected as unnecessary dependency surface. Gemini's warning stands only as a **test item**: task 1.1's done-criteria should include a round-trip test of a large fils value through a server action.

### R-8 · Print CSS → reinstate server-side PDF — **rejected: challenges locked D-09 without new facts**
Gemini recommends adding react-pdf/headless-Chromium. D-09 is locked, and the review ground rules require such challenges to be labeled and escalated, not asserted. The two real kernels inside it: (a) **fonts at print time** — mitigate by self-hosting Inter Tight + JetBrains Mono with `font-display: block` and preloading on the invoice detail route (add to task 6.1 spec); (b) **thermal printers** — genuinely incompatible with A4 print CSS, but that's exactly open question **Q-07**. **Standing rule adopted:** if Q-07's answer is a thermal printer, D-09 must be formally reopened with Mushtaq — that is the one scenario where Gemini's recommendation becomes right.

### R-9 · Security findings — **all three adopted (best section of Gemini's review)**
1. **Identity from the session, never the client:** every server action derives user + role via `auth.getUser()` / the verified JWT server-side; no client-supplied role or user-id parameters, ever. → CLAUDE.md §4 addition. (Consistent with existing rules; now explicit.)
2. **TOTP enrollment gap — genuinely new, and good:** requiring TOTP is meaningless if a fresh admin account can roam before enrolling. Task 2.1 must gate **all** admin routes behind "MFA enrolled," routing un-enrolled admins to a locked setup-only page. Add an acceptance test: new admin account cannot reach any admin route pre-enrollment.
3. **Revocation via RLS `is_active` check:** complements Claude's B-5 (short access-token TTL + middleware check). Adding the `is_active` lookup into the RLS policy function closes the *direct PostgREST with a live JWT* path that middleware never sees. Cheap (one indexed lookup per statement). → fold into task 1.3's policy function.

---

## Part 3 — Final change list for approval

Every change below traces to an agreed finding or a ruling above. **Nothing is applied yet — approve, then all documents get edited in one pass.**

### SCHEMA_DESIGN.md
1. Add `services` table + seed (C-3).
2. Add `invoice_lines.qty` (check > 0); define `govt_fee`/`service_fee` as **unit** fees (C-2).
3. Remodel extras: `invoice_extra_columns` (per-invoice defs: label, vatable, position) + `invoice_line_fees` junction (R-1).
4. Numbering: `number_year` + `number_seq`, `unique(number_year, number_seq)`; `invoice_number` display-only, non-unique (S-4). Counter upsert seeded with 1 (S-1); counter step ordered last-before-events (R-3 kernel).
5. Per-line frozen VAT: `invoice_lines.vat_amount`, and per junction row (S-7); rounding = half-up, nearest fils, line basis — **VERIFY provision** with accountant.
6. `payments`: `method_id → payment_methods` lookup table (R-2); `reverses_payment_id`; `check (amount <> 0)` (S-6).
7. `customer_id NOT NULL`; walk-ins quick-create minimal customer rows (S-9).
8. `payment_status` derived at read time via view/lateral join — never stored (S-8).
9. Immutability trigger = **column-transition matrix** (S-5.2b: exact allowed column sets for draft→issued and issued→voided); `BEFORE DELETE` trigger blocking non-draft deletes (S-5.3); append-only = revoke + no-policy + raising trigger on payments AND invoice_events (S-6); `SET search_path` pinned on all SECURITY DEFINER functions (S-5.2a).
10. Child-write parent-lock trigger: writes to lines/extras/fees re-select parent `FOR NO KEY UPDATE`, reject unless draft (S-3).
11. Add: `invoices.notes`, `invoices.terms`, `invoices.replaces_invoice_id`, `invoices.supply_date` (VERIFY), `settings.bank_details`, `settings.tagline`; GIN trigram expression index on `customer_snapshot->>'name'` (S-10).
12. RLS matrix from REVIEW_REPORT §5.3 written in full; policy function includes `is_active` check (R-9.3); service-role key never used for ordinary reads/writes (S-5.4).

### CLAUDE.md
13. Money: "bigint fils only" — remove "or numeric" (C-11).
14. Immutability: trigger **mandatory**; RLS + privileges are additional layers, never alternatives (C-12).
15. Add: issue transition only via single-statement `issue_invoice()` call — never app-orchestrated (R-4).
16. Add: identity/role from server-verified session only; no client-supplied principals (R-9.1).

### DECISIONS.md
17. Record rulings R-1, R-2 as decided; log D-09 conditional-reopen rule (thermal-printer answer to Q-07 reopens it) (R-8).
18. Add standing VERIFY register: FTA field list (F-1), simplified-invoice threshold (F-2), annual-reset visual duplicates acceptability (S-4), rounding provision (F-5), Supabase backup retention terms (F-3), post-deregistration correction path (F-4a) → one hour with the client's accountant, before Phase 6 sign-off.
19. F-3 reword: Supabase Pro backups ≠ 5-year retention; retention = live DB + **monthly pg_dump to client-owned storage** + restore drill.

### BUILD_PHASES.md
20. Phase 0: add staging Supabase project + Vercel preview envs + migration drill (B-3.1).
21. Split 1.2 → 1.2a (issue function + numbering + concurrency/gapless tests incl. year-boundary, double-click, edit-vs-issue races) and 1.2b (immutability matrix + append-only + delete guards + tests) (B-4).
22. Split 4.1 → 4.1a (line grid + totals) / 4.1b (pickers + draft save) (B-4).
23. Task 4.2 additions: minimal readable print stylesheet (demo insurance, B-1); button-disable + already-issued-as-success handling (R-6).
24. Task 2.1 additions: TOTP recovery codes + lockout runbook (B-3.5); admin-routes-blocked-until-enrolled gate + test (R-9.2). Task 2.2: shorten access-token TTL + revocation lockout-time test (B-5).
25. Phase 3: add 3.3 services catalogue CRUD (B-3.3). Task 5.1: ⛔ Q-11 marker + configurable due-date default (B-5).
26. Task 6.1: resize as build-from-scratch (no print CSS exists in the prototype, B-2); add font preload/`font-display: block` spec (R-8a). Task 6.3: Broadcast-refetch pattern, not `postgres_changes` on core tables (R-5).
27. Phase 7: add backup-export + restore drill (B-3.2/F-3); uptime pinger + Sentry alerts (B-3.4). Resend: keep keys out of Phase 0; add ⛔-blocked emailing task pending Q-11–17 (B-3.6).
28. Seed/tests: never copy prototype invoice amounts (INV-153/151/150 are internally wrong, C-5); fixtures derive from the calc spec.

### Process
29. Move prototype to `/reference/` or fix paths (C-9).
30. Vocabulary: "sealed" = issued/immutable, independent of payment (C-8) — keep the client-facing label only if it can't mislead staff about editability.

---

**Approval needed from Mushtaq on two items specifically:**
- **#4 residual:** are visually-duplicate INV-NN numbers across years acceptable? (VERIFY with the accountant; if not, D-12's no-year format must be revisited with the client.)
- **#17:** the D-09 conditional-reopen rule (thermal printer ⇒ PDF discussion reopens).

Everything else follows mechanically from agreed findings.
