# BUILD_PHASES.md — Implementation Plan (Draft v1)

**Status:** Draft. Claude Code planning session must validate ordering and completeness before Phase 1 begins.
**How to use:** Each task is sized for one Claude Code session. Assign tasks explicitly: *"Do task 2.1 from BUILD_PHASES.md."* Every task ends with `pnpm build` + `pnpm lint` passing and a branch pushed. Tasks marked **[FABLE]** warrant the strongest model; unmarked tasks can run on Sonnet/Opus.
**Blocked tasks:** ⛔ Q-xx means blocked by an open client question in DECISIONS.md — build configurable stubs only.

---

## Phase 0 — Foundation (~2 days)

- **0.1** Scaffold: Next.js 15 App Router, TS strict, Tailwind, shadcn/ui init, ESLint/Prettier, pnpm. Repo hygiene: `.gitignore` (env files!), branch protection on main. *Done = clean build of empty app.*
- **0.2** Supabase project (Pro tier), Drizzle wiring, migration pipeline (`drizzle-kit`), local env setup, Sentry + Resend keys in env. *Done = a trivial migration applies and rolls forward.*
- **0.3** Theme foundation: Stamped Paper design tokens as CSS variables (light/dark), Inter Tight + JetBrains Mono self-hosted, base layout shell. Port token values from `/reference/invoice_system_v2.html`. *Done = themed empty shell with toggle.*

## Phase 1 — Schema & core functions (~3–4 days) — the riskiest phase

- **1.1 [FABLE]** Finalize SCHEMA_DESIGN.md review → write all Drizzle schema + initial migrations (all 9 tables, constraints, indexes). *Done = migrations apply cleanly to fresh DB; drizzle types generate.*
- **1.2 [FABLE]** `issue_invoice()` Postgres function: locking, server-side total recomputation, VAT + customer snapshots, gapless counter, event write — single transaction. Plus the immutability trigger on issued invoices and append-only enforcement on `invoice_events` / `payments`. *Done = SQL tests prove: concurrent issues produce no gaps/duplicates; UPDATE on issued invoice financials raises; UPDATE/DELETE on events raises.*
- **1.3 [FABLE]** RLS policies for every table (admin/staff matrix from CLAUDE.md §4). *Done = policy tests pass for both roles.*
- **1.4** Seed script: settings row, admin user, demo customers + services matching prototype demo data.

## Phase 2 — Auth & app skeleton (~3 days)

- **2.1** Supabase Auth: email/password, TOTP enrollment + enforcement for admin role, middleware guarding routes by role, `is_active` checks. *Done = staff cannot reach admin routes server-side (tested via direct request, not just missing UI).*
- **2.2** Session revocation (admin kills any session) + user management screens (admin creates staff accounts; no self-signup). *(D-18, D-19)*
- **2.3** App shell: navigation, global search scaffold (customers + invoice numbers via trigram), dashboard placeholder.

## Phase 3 — Customers & settings (~2 days)

- **3.1** Customers CRUD (regular/walk-in, soft delete, zod validation, TanStack table with search/filter). ⛔ Q-05 for final field set — build fields nullable/configurable.
- **3.2** Settings page (admin only): company details, VAT toggle, number format, paper size. ⛔ Q-02/Q-03/Q-07 for values, not structure. *Done = VAT toggle demonstrably affects a new draft's calculation and NOT any issued invoice.*

## Phase 4 — Invoice creation & issue flow (~4–5 days) — the heart

- **4.1** Invoice form: line items with two-fee columns (govt/service), dynamic extra charges with VAT-ability toggle, live totals (display-only — server recomputes), walk-in vs regular customer picker, draft save. ⛔ Q-01 confirmation, Q-04 presets.
- **4.2 [FABLE]** Issue flow: mandatory slide-over preview (shadcn Sheet, D-23) → "Confirm & Issue" → server action calling `issue_invoice()` → sealed state UI ("Paid · sealed" language, stamp reference). Error paths: concurrent edit, empty invoice, settings changed mid-draft. *Done = issued invoice is visibly and actually immutable; number appears only after issue.*
- **4.3** Invoice list: TanStack table, Roman numeral indices, status/payment filters, date ranges, global search integration.
- **4.4** Void + replacement-invoice flow (admin only), writing events. *Done = voided invoice keeps its number and financials frozen.*

## Phase 5 — Payments & ledger (~2–3 days)

- **5.1** Record payment (method, reference, date), partial handling, derived status, reversal flow. ⛔ Q-10 for methods list. *Done = unpaid → partial → paid transitions purely from payments sum; overdue rendering in burnt orange.*
- **5.2** Customer ledger view: invoices + payments per customer, balances.
- **5.3** Invoice detail page: full event timeline from `invoice_events` (the audit story to show the client).

## Phase 6 — Print, export, realtime (~2–3 days)

- **6.1 [FABLE-optional]** Print CSS (D-09): pixel-honest A4 (⛔ Q-07) layout matching the Stamped Paper invoice design — header from settings, two-fee columns, VAT summary, TRN, "sealed" reference. Test in Chrome + Edge print-to-PDF. ⛔ Q-02 header details, ⛔ Q-08 Arabic (flag immediately if yes).
- **6.2** CSV export (invoices, payments, per-period VAT report basis) (D-18).
- **6.3** Supabase Realtime on invoice list (multi-employee live updates).

## Phase 7 — Hardening & delivery (~3 days)

- **7.1** Dashboard: monthly totals, VAT collected, outstanding balances, recent activity.
- **7.2** Sentry wiring, empty/error/loading states pass, mobile check, dark mode pass.
- **7.3** Security sweep: server-side authz on every mutation, rate limiting on auth, zod on all inputs, secrets audit.
- **7.4** Data import from client's Excel ⛔ Q-09 — may be dropped if client has no usable data.
- **7.5** Deploy production (Vercel + client domain per D-04), backups verified, admin walkthrough notes, handover doc per agreement.

---

## Sequencing rules

1. Phase 1 gates everything — no Phase 2+ until 1.1–1.3 are reviewed and merged.
2. Hard logic first, UI polish last. If the client's answers arrive mid-build, update DECISIONS.md before touching blocked tasks.
3. **Demo milestone (40% payment):** end of Phase 4 + 5.1 — client can create, issue, print-preview, and record payment on real-looking data.
4. Fable budget: tasks 1.1, 1.2, 1.3, 4.2 are the ones worth premium reasoning. Everything else is routine.
