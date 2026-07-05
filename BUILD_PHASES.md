# BUILD_PHASES.md — Implementation Plan (v2 — post-adjudication)

**Status:** Approved for build. Incorporates ADJUDICATION.md Part 3 items 20–28 (traceability tags `[#n]`).
**How to use:** Each task is sized for one Claude Code session. Assign tasks explicitly: *"Do task 2.1 from BUILD_PHASES.md."* Every task ends with `pnpm build` + `pnpm lint` passing and a branch pushed. Tasks marked **[FABLE]** warrant the strongest model; unmarked tasks can run on Sonnet/Opus.
**Blocked tasks:** ⛔ Q-xx means blocked by an open client question in DECISIONS.md — build configurable stubs only.
**Fixture rule [#28]:** never copy the prototype's invoice/payment amounts into seeds or tests — INV-153/151/150 in `reference/invoice_system_v2.html` are internally wrong (REVIEW_REPORT C-5). All fixtures derive from the calculation spec in SCHEMA_DESIGN §3.1.

---

## Phase 0 — Foundation (~2–3 days)

- **0.1** Scaffold: Next.js 15 App Router, TS strict, Tailwind, shadcn/ui init, ESLint/Prettier, pnpm. Repo hygiene: `.gitignore` (env files!), branch protection on main. *Done = clean build of empty app.*
- **0.2** Supabase projects — **production AND staging** [#20] (Pro tier for production), Drizzle wiring, migration pipeline (`drizzle-kit`), local env setup, Sentry keys in env. *(Resend keys deliberately NOT wired here — see task 6.4 [#27].)* *Done = a trivial migration applies and rolls forward **on staging**; production only verified for connectivity.*
- **0.3** Theme foundation: Stamped Paper design tokens as CSS variables (light/dark), Inter Tight + JetBrains Mono self-hosted, base layout shell. Port token values from `reference/invoice_system_v2.html`. *Done = themed empty shell with toggle.*
- **0.4** Staging/deploy wiring [#20]: Vercel project + preview deployments, envs pointed at the **staging** Supabase project for previews, production env vars reserved for the production deploy. Document the migration drill: staging first, always. *Done = a preview deploy runs against staging.*

## Phase 1 — Schema & core functions (~4 days) — the riskiest phase

- **1.1 [FABLE]** Write all Drizzle schema + initial migrations from SCHEMA_DESIGN v2 (all 12 tables, constraints, indexes, unit-fee semantics, `mode: 'number'` bigint mapping). *Done = migrations apply cleanly to a fresh staging DB; drizzle types generate; a large fils value round-trips through a server action without precision loss (ADJUDICATION R-7).*
- **1.2a [FABLE]** `issue_invoice()` Postgres function per SCHEMA_DESIGN §3: locking order, single-statement settings snapshot, server-side recompute with per-line frozen VAT (§3.1 rounding), counter upsert **seeded with 1** and ordered last-before-events, event write — single transaction, `SECURITY DEFINER` + pinned `search_path`. *Done = SQL tests prove [#21]: concurrent issues produce no gaps/duplicates; **first invoice of a fresh year gets seq 1 (year-boundary test)**; double-click/concurrent confirm on the same draft → exactly one issue; **edit-vs-issue race → exactly one wins** (parent-lock, §4.3).*
- **1.2b [FABLE]** Enforcement triggers per SCHEMA_DESIGN §4: the immutability **column-transition matrix** (§4.1), `BEFORE DELETE` draft-only guard, child-write parent-lock trigger (§4.3), three-layer append-only on `invoice_events` AND `payments` (§4.2). *Done = tests prove: UPDATE on issued financials raises; disallowed transitions raise; non-draft DELETE raises; UPDATE/DELETE on events/payments raises for every role including service paths.*
- **1.3 [FABLE]** RLS policies for every table per SCHEMA_DESIGN §5, including the `app_role()` helper with the **`is_active` circuit-breaker** (ADJUDICATION R-9.3) and the service-role usage policy. Verify PostgREST exposes nothing beyond the matrix. *Done = policy tests pass for both roles + a deactivated user with a live JWT gets nothing.*
- **1.4** Seed script: settings row, admin user, `payment_methods` (Cash/Card/Bank transfer/Cheque pending Q-10), demo customers + the **services catalogue** from the prototype (unit fees in fils). **Fixture rule applies [#28]: catalogue fees yes, prototype invoice amounts never.**

## Phase 2 — Auth & app skeleton (~3 days)

- **2.1** Supabase Auth: email/password, TOTP enrollment + enforcement for admin role, middleware guarding routes by role, `is_active` checks. **Additions [#24]: TOTP recovery codes generated at enrollment + a documented admin-lockout recovery runbook; admin routes hard-gated behind "MFA enrolled" — an un-enrolled admin lands on a locked setup-only page (ADJUDICATION R-9.2).** *Done = staff cannot reach admin routes server-side (tested via direct request); **a fresh admin account cannot reach any admin route before TOTP enrollment (test)**.*
- **2.2** Session revocation (admin kills any session) + user management screens (admin creates staff accounts; no self-signup). **Additions [#24]: shorten the Supabase access-token TTL (~10 min) so revocation is real; acceptance test — a revoked/deactivated user is locked out within N minutes (middleware + RLS `is_active` both verified).** *(D-18, D-19)*
- **2.3** App shell: navigation, global search scaffold (customers + invoice numbers via trigram; snapshot-name index lands with 1.1), dashboard placeholder.

## Phase 3 — Customers, settings & catalogue (~2–3 days)

- **3.1** Customers CRUD (regular/walk-in, soft delete, zod validation, TanStack table with search/filter). Walk-in quick-create path per SCHEMA_DESIGN §2.3. ⛔ Q-05 for final field set — build fields nullable/configurable.
- **3.2** Settings page (admin only): company details (incl. tagline + bank details), VAT toggle, number format, paper size, notes/terms defaults, due-days default, payment-methods management (D-25). ⛔ Q-02/Q-03/Q-07 for values, not structure. *Done = VAT toggle demonstrably affects a new draft's calculation and NOT any issued invoice.*
- **3.3** Services catalogue CRUD [#25] (admin-edit, staff-read, per prototype's Services page): name, unit, govt/service unit fees in fils, soft delete/deactivate. *Done = catalogue drives the invoice form picker (4.1b).*

## Phase 4 — Invoice creation & issue flow (~5 days) — the heart

- **4.1a [#22]** Invoice line grid + totals: two-fee columns (govt/service, unit fees × qty), dynamic extra columns with VAT-ability toggle (junction model, D-24), live totals (display-only — server recomputes). ~~⛔ Q-01~~ **Q-01 CONFIRMED 2026-07-05 (two columns) — see DECISIONS.md §B.**
- **4.1b [#22]** Pickers + draft persistence: walk-in vs regular customer picker (quick-create walk-in), "from service catalogue" picker (3.3), notes/terms fields (defaults from Settings), draft save/resume. ⛔ Q-04 presets.
- **4.2 [FABLE]** Issue flow: mandatory slide-over preview (shadcn Sheet, D-23) → "Confirm & Issue" → server action calling `issue_invoice()` → sealed state UI ("sealed" = issued per CLAUDE.md §5 vocabulary). Error paths: concurrent edit, empty invoice, settings changed mid-draft. **Additions [#23]: (a) a minimal, readable A4 print stylesheet lands HERE — demo insurance (REVIEW_REPORT B-1); pixel-honest print remains 6.1; (b) the Confirm button disables on first click, and an "already issued" response renders as success (show the issued invoice), not an error toast (ADJUDICATION R-6).** *Done = issued invoice is visibly and actually immutable; number appears only after issue; Ctrl+P on the detail view produces a readable A4 page.*
- **4.3** Invoice list: TanStack table over the `invoice_list` view (derived payment status), Roman numeral indices, status/payment filters, date ranges, global search integration.
- **4.4** Void + replacement-invoice flow (admin only), writing events + `replaces_invoice_id`. *Done = voided invoice keeps its number and financials frozen; replacement links back.*

## Phase 5 — Payments & ledger (~2–3 days)

- **5.1** Record payment (method from `payment_methods`, reference, date), partial handling, derived status, reversal flow (`reverses_payment_id`). ~~⛔ Q-10~~ **Q-10 ANSWERED 2026-07-05 (cash/bank/card — seed matches)**, ~~⛔ Q-11~~ **Q-11 answered 2026-07-05: one week → `due_days_default = 7`** (the configurable default was the right call). *Done = unpaid → partial → paid transitions purely from payments sum; overdue rendering in burnt orange.*
- **5.2** Customer ledger view: invoices + payments per customer, balances.
- **5.3** Invoice detail page: full event timeline from `invoice_events` (the audit story to show the client).

## Phase 6 — Print, export, realtime (~3 days)

- **6.1 [FABLE-optional]** Print CSS (D-09): **build from scratch — the prototype contains no print CSS at all (REVIEW_REPORT B-2)** [#26]. Pixel-honest **A4 AND A5** (~~⛔ Q-07~~ **answered 2026-07-05: A4+A5, not thermal — D-26 reopen never fires**) matching the Stamped Paper invoice design — header from settings snapshot, two-fee + extra columns, VAT summary, TRN, "sealed" reference. **Self-hosted fonts preloaded on the invoice route with `font-display: block`** (ADJUDICATION R-8a). Full vs simplified tax-invoice conditional blocks per VERIFY V-2. Test in Chrome + Edge print-to-PDF. ⛔ Q-02 header details (logo file + legal name — THE remaining blockers), **Q-08 answered 2026-07-05: BILINGUAL English+Arabic — flagged; needs an Arabic typeface via next/font and RTL text runs; Mushtaq confirms scope before this task starts.** **If Q-07's answer is thermal: STOP — D-26 reopens D-09 with Mushtaq.**
- **6.2** CSV export (invoices, payments, per-period VAT report basis) (D-18). Fils → 2-decimal AED strings from integer math.
- **6.3** Realtime invoice list: **Broadcast-refetch pattern, not `postgres_changes` on core tables** [#26] — server action (or trigger) emits a lightweight "invoices changed" broadcast; clients refetch through normal RLS-checked queries (ADJUDICATION R-5). **VERIFY current Supabase Realtime guidance when this task starts.**
- ~~**6.4** invoice emailing via Resend~~ — **DELETED 2026-07-05: the client answered "printing is enough."** Resend drops from the stack; no keys ever wired (the rule in this very line, executed).

## Phase 7 — Hardening & delivery (~3 days)

- **7.1** Dashboard: monthly totals, VAT collected, outstanding balances, recent activity.
- **7.2** Sentry wiring, empty/error/loading states pass, mobile check, dark mode pass.
- **7.3** Security sweep: server-side authz on every mutation (session-derived identity only, CLAUDE.md §4), rate limiting on auth, zod on all inputs, secrets audit.
- **7.4** Data import from client's Excel ⛔ Q-09 — may be dropped if client has no usable data.
- **7.5** Deploy production (Vercel + client domain per D-04), backups verified, admin walkthrough notes, handover doc per agreement.
- **7.6 [#27]** Retention & continuity (F-3/D-06 reword): **monthly `pg_dump` export to client-owned storage** set up and documented + **backup/restore drill** — restore latest backup + export into a scratch project and verify an invoice's integrity end-to-end. *Done = a restored invoice matches its sealed totals.*
- **7.7 [#27]** Uptime monitoring: external pinger on the production URL + Sentry alert rules routed to the operator. *Done = a simulated outage produces an alert.*

---

## Sequencing rules

1. Phase 1 gates everything — no Phase 2+ until 1.1–1.3 are reviewed and merged.
2. Hard logic first, UI polish last. If the client's answers arrive mid-build, update DECISIONS.md before touching blocked tasks.
3. **Demo milestone (40% payment):** end of Phase 4 + 5.1 — client can create, issue, **print a readable invoice (4.2's minimal print CSS)**, and record payment on real-looking data. *(Fixture rule applies to "real-looking" — derive from the calc spec, never the prototype's broken amounts.)*
4. Fable budget: tasks 1.1, 1.2a, 1.2b, 1.3, 4.2 are the ones worth premium reasoning. Everything else is routine.
5. Migrations run staging-first, always (0.4). Production migrations only from merged main.
