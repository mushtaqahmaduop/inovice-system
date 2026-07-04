# CLAUDE.md — Invoice System (Dubai Typing Centre)

**Project:** Single-tenant cloud invoice & customer ledger system for a UAE government services / typing centre (~10 users, ~300 invoices/month).
**Operator:** Zeerak Hostix (Mushtaq Ahmed).
**Source of truth:** `PROJECT_PLAN.md` at repo root. If this file and PROJECT_PLAN.md ever conflict, stop and flag it — do not pick one silently.
**Reference UI:** `/reference/invoice_system_v2.html` (approved prototype; calculation logic verified against a real client invoice).

This file contains hard rules for every Claude Code session. Read PROJECT_PLAN.md before starting any non-trivial task.

---

## 1. Git & workflow rules

- **NEVER commit to `master`/`main` directly.** Always create a feature branch first (`feat/…`, `fix/…`, `chore/…`). No exceptions, including "small" changes.
- One task = one branch = one focused set of commits. Do not mix unrelated changes.
- **A task is not complete until `pnpm build` passes and `pnpm lint` is clean.** Verify before declaring done. Never declare a refactor complete without proving the app still builds.
- Never commit secrets. `.env*` files must be in `.gitignore` from the first commit. If a secret is ever committed, stop and flag it immediately — it must be rotated.
- Do not add dependencies without stating why. Prefer the locked stack (§2) over new libraries.

## 2. Locked tech stack — do not substitute

- **Next.js 15 App Router**, TypeScript `strict: true`, single deployment on **Vercel**. No separate API server. No Fastify, no Redis, no BullMQ, no queues.
- **Supabase**: Postgres, Auth (email/password; **TOTP MFA required for the admin role**), Realtime, Storage. Supabase **Pro** tier from day one (daily backups — FTA 5-year retention requirement).
- **Drizzle ORM** with SQL migrations. Migrations are **append-only**: never edit or delete an applied migration; always add a new one.
- **UI:** Tailwind + shadcn/ui, react-hook-form + zod for all forms, Zustand for client state, TanStack Table for data tables.
- **PDF:** NONE server-side. Invoices print via **browser print CSS** only. Walk-in customers receive paper; regular clients print-to-PDF. Do not add @react-pdf/renderer, puppeteer, or any PDF library.
- **Email:** Resend. **Errors:** Sentry.

## 3. Invoice domain rules (non-negotiable invariants)

### 3.1 Immutability
- **Issued invoices are immutable. Ever.** No UPDATE path may modify the financial content of an invoice once its status is `issued` (or beyond). Enforce at three layers: UI (no edit affordance), application (server actions reject), and **database (trigger or RLS policy blocking UPDATE on issued rows' financial columns)**.
- Corrections to an issued invoice happen only via a new document (credit note / replacement invoice), never by editing.
- Draft invoices are freely editable. The `draft → issued` transition is the sealing moment.

### 3.2 Numbering
- Invoice numbers are generated **only** by the atomic gapless Postgres function (row-locked counter, resets each January). Format `INV-NN`, Settings-configurable.
- **Never** generate, guess, or format invoice numbers in application code. Never assign a number to a draft. The number is allocated inside the issue transaction, at the moment of issue, and never reused.

### 3.3 Money & VAT
- Every line has two fee components: **Government Fee (0% VAT, passthrough — not revenue)** and **Service/Typing Fee (5% VAT — actual revenue)**. Plus optional dynamic extra columns, each with its own VAT-ability flag.
- **VAT rate and VAT-registration state are snapshotted onto the invoice at issue time.** Never compute an issued invoice's VAT from current Settings.
- The Settings VAT toggle (registered / deregistered) affects **future** invoices only.
- All monetary values: store as integers in fils (AED minor unit) or `numeric` — **never floating point**. Display with JetBrains Mono.

### 3.4 Payments & events
- Payments live in a **`payments` table** (one row per payment). There is no `paid_amount` column to mutate. Invoice payment status (`unpaid` / `partial` / `paid`) is derived from the sum of payments vs invoice total.
- **`invoice_events` is append-only**: every state change (created, edited-as-draft, issued, payment recorded, voided/credited, printed, emailed) writes an event row with actor, timestamp, and payload. No UPDATE or DELETE on this table — enforce at DB level.

## 4. Data & security rules

- Soft deletes only for business entities (customers, etc.). Hard DELETE is forbidden in application code.
- Customers are `regular` or `walk-in`. Walk-ins may have minimal data; do not make regular-customer fields NOT NULL if walk-ins can't supply them.
- Roles: **Admin** (owner — full access, TOTP required) and **Staff**. Staff cannot: manage users, change Settings, void/credit invoices, or delete anything. Enforce server-side, never UI-only.
- Session revocation (admin can kill any user's sessions) is MVP scope, not a later phase.
- All inputs validated with zod on the server. Never trust client-computed totals — recompute all money server-side at issue time.

## 5. Design system rules — "Stamped Paper"

- **Light:** cool paper `#f6f5f2`. **Dark:** deep blue-black `#0a0d12`.
- **Single accent:** FTA federal blue (`#003b5c` light / `#5b95c4` dark) — used ONLY for action signals. **Burnt orange `#c2410c` — used ONLY for overdue.** No other accent colors, no gradients.
- **Typography:** Inter Tight for UI text; **JetBrains Mono for ALL numerics** (amounts, invoice numbers, dates in tables). **No serif fonts anywhere** — explicitly no Instrument Serif.
- Editorial details from the approved prototype: Roman numeral row indices, hairline borders, "Paid · sealed" lock indicators, stamp-style document reference top-right.
- **Invoice preview:** slide-over drawer (~45–50% width, Esc/outside-click closes) via shadcn Sheet — never a permanent split view. Issuing an invoice always shows a mandatory preview + "Confirm & Issue" step before sealing.
- Use only design tokens (CSS variables) defined in the theme. No hardcoded hex values in components.

## 6. Open questions — do not build on assumptions

A 17-question brief is with the client, awaiting answers. `DECISIONS.md` (once generated) lists which tasks are blocked by which open question. Rules:

- If a task depends on an unanswered client question, **stop and flag it** rather than assuming an answer.
- Anything plausibly client-variable (labels, fee column names, print layout details) goes in Settings or config, not hardcoded.

## 7. Session discipline

- At session start: read this file, then PROJECT_PLAN.md, then (when they exist) SCHEMA_DESIGN.md / BUILD_PHASES.md / DECISIONS.md.
- Work on exactly the task assigned (e.g., "task 2.3 from BUILD_PHASES.md"). Do not expand scope. If you find an adjacent problem, note it in a `FINDINGS.md` entry instead of fixing it inline.
- **Challenge, don't comply silently.** If an instruction or a document contains something wrong, risky, or contradictory, say so before proceeding.
- Before finishing: `pnpm build` passes, `pnpm lint` clean, branch pushed, and a short summary of what changed and what was verified.
