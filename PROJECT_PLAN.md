# PROJECT_PLAN.md — Invoice System, v2

**Status:** Approved master plan (v2 — regenerated 2026-07-04, supersedes v1 of 2026-06-28)
**Author:** Zeerak Hostix (Mushtaq Ahmed)
**Purpose:** Single source of truth for the project. Detail lives in the companion documents; this plan governs. If any document conflicts with this one, stop and flag.

**Companion documents:**
- `CLAUDE.md` — hard rules for every coding session
- `DECISIONS.md` — locked decisions (D-01…D-23) + open client questions (Q-01…)
- `SCHEMA_DESIGN.md` — full data model + issue_invoice() transaction spec
- `BUILD_PHASES.md` — ordered, session-sized task plan
- `REVIEW_PROMPTS.md` — pre-build review workflow (Claude Code + Codex cross-check)
- `/reference/invoice_system_v2.html` — approved UI prototype (calculations verified against a real client invoice)

**Changes from v1:** issued invoices immutable (was: editable with restrictions); `payments` table replaces `paid_amount`; `invoice_events` append-only model; CSV export, session revocation, global search moved into MVP; Supabase Pro from day one; **server-side PDF generation removed entirely** — browser print CSS only; invoice preview changed from split view to slide-over drawer with mandatory confirm-at-issue.

---

## 1. Executive summary

A single-tenant, web-based invoice and customer ledger system for a Dubai-based government services / typing centre, replacing a paper + Excel workflow. Built by a solo developer over ~6 working weeks as a lean Next.js + Supabase application. The developer operates the production system long-term as a managed service.

Explicitly **not** built to multi-tenant SaaS standards: one company, ~10 users, ~300 invoices/month. Every decision favours delivery speed, operational simplicity, and financial correctness over scale headroom or reusability.

The two properties the system stakes its credibility on:
1. **Financial records cannot be silently altered** — issued invoices are immutable, all money movements are append-only events.
2. **Invoice numbers are gapless and duplicate-free** under concurrent use — allocated atomically at the moment of issue.

## 2. Client & business context

UAE-registered services agency: Government Transactions, Document Typing, Translation, Clearance. Customers are long-term business clients plus walk-in individuals. Reference comparable: Prestige Land Typing & Photocopying Services. Client is the brother of Mushtaq's former mentor — relationship pricing applies (D-01).

**Business-model implication:** most invoice lines carry two fee components —

| Component | Example | VAT | Nature |
|---|---|---|---|
| Government fee | AED 270 Emirates ID renewal | 0% | Passthrough — not agency revenue |
| Service/typing fee | AED 70 processing | 5% | Agency's actual revenue |

Plus ad-hoc extra charges (courier, stamp, photocopy) with per-charge VAT-ability. Hence the dynamic-column invoice design (D-10, D-11).

**Scale:** ~10 employees (1 admin + staff), 10–15 invoices/day, 4–6 concurrent users peak, a few hundred regular customers + open-ended walk-ins.

**VAT status:** currently registered (TRN exists) but deregistration applied for. System must operate in both modes via a Settings toggle with no code change (D-16); each invoice snapshots the VAT state at issue.

**Numbering:** sequential `INV-NN`, resets each January, format configurable (D-12). Client's stated preference — locked.

**Compliance anchors:** UAE FTA tax-invoice requirements and 5-year record retention → Supabase Pro (daily backups) from day one (D-06). Exact FTA field requirements to be verified during the review phase (REVIEW_PROMPTS.md, marked VERIFY).

## 3. Scope

**MVP (delivered for the build fee):**
- Auth: email/password, TOTP MFA for admin, admin-created accounts (no self-signup), session revocation
- Roles: Admin / Staff with server-side enforcement (D-19)
- Customers: regular + walk-in, soft delete, ledger view
- Invoices: draft → issue (immutable) → payments → derived status (unpaid/partial/paid), void + replacement flow
- Two-fee line structure + dynamic extra charges with VAT toggles
- Slide-over preview + mandatory confirm-at-issue (D-23)
- Print CSS invoice output (browser print / print-to-PDF) — no server PDFs (D-09)
- Payments recording with methods + references; reversal rows, never edits
- Append-only event timeline per invoice (audit story)
- Global search (customers, invoice numbers), invoice list filters
- CSV export (invoices, payments, VAT-report basis)
- Settings: company details, VAT toggle, number format, paper size
- Realtime invoice list updates across employees
- Dashboard: monthly totals, VAT collected, outstanding balances
- Sentry error tracking; production deployment on client's domain

**Explicitly out of MVP:** customer self-service portal, mobile app, WhatsApp automation, Arabic UI (print-layout Arabic pending Q-08), formal credit-note documents (void + replacement covers MVP), multi-branch/multi-tenant anything, accounting-software integrations.

Scope additions beyond this list are chargeable change requests — see agreement.

## 4. Tech stack (with rejection rationale)

| Choice | Rejected alternative | Why |
|---|---|---|
| Next.js 15 App Router, single Vercel deployment | Separate Fastify API (HOSTYLLO-style) | One deployment, one repo, no CORS/auth-token plumbing; scale doesn't justify a service split |
| Supabase (Postgres/Auth/Realtime/Storage) | Self-managed Postgres + custom auth | MFA, RLS, backups, realtime out of the box; solo-operator friendly |
| Drizzle ORM | Prisma | Lighter, SQL-first, already used in HOSTYLLO — one mental model |
| Browser print CSS | @react-pdf/renderer / puppeteer | Walk-ins get paper, regulars print-to-PDF; removes an entire server dependency and failure class |
| Zustand + TanStack Table + RHF/zod + shadcn/ui | Heavier state/UI frameworks | Small app, boring tools, fast delivery |
| No Redis, no queues, no workers | BullMQ etc. | Nothing here is async at this scale; a cron-less design is a feature |

Infra: Vercel (app) + Supabase Pro (~$25/mo) + Resend (free tier) + Sentry (free tier). Client owns domain; Zeerak Hostix operates accounts with handover terms (D-04).

## 5. Architecture overview

Single Next.js app. Server actions (or route handlers) are the only write path; all money mutations funnel through Postgres functions — most importantly `issue_invoice()` (see SCHEMA_DESIGN.md §3). RLS on all tables as defense-in-depth behind app-level authz. Client-side totals are display-only; the server recomputes everything at issue. Realtime subscription drives the shared invoice list. No background jobs.

Data model: 9 tables — settings, profiles, customers, invoices, invoice_lines, invoice_extra_charges, payments, invoice_events, invoice_counters. Full spec in SCHEMA_DESIGN.md. Money stored as fils (bigint), never floats.

## 6. Key technical decisions (summary — details in DECISIONS.md / SCHEMA_DESIGN.md)

1. **Immutability at three layers** (UI, server, DB trigger) for issued invoices — D-13
2. **Atomic gapless numbering** via per-year counter row locked inside the issue transaction — D-12
3. **VAT + customer snapshotting** at issue; Settings affect the future only — D-16
4. **Payments as rows, status derived** — no mutable paid_amount — D-14
5. **invoice_events append-only**, DB-enforced — D-15
6. **Print CSS as the sole document output** — D-09

## 7. Security & compliance

- TOTP MFA mandatory for admin; staff permissions enforced server-side (never UI-only)
- RLS on every table; append-only enforcement via both privileges and triggers
- zod validation on all inputs; server recomputes all money
- Soft deletes only; no hard DELETE in application code
- Secrets: env-only, gitignored from first commit; any leaked credential rotated immediately
- FTA: 5-year retention via Supabase Pro daily backups; tax-invoice mandatory fields verified in review phase; registered/deregistered invoice wording handled via snapshot + print template

## 8. Costs

- **Year 1 run cost:** Supabase Pro ~$25/mo; Vercel hobby/pro as needed; Resend + Sentry free tiers → covered by AED 200/month operations fee with margin
- **Client pays:** build fee (D-01), monthly fee from go-live, first 3 months upfront (D-02), own domain

## 9. Timeline

6 working weeks across 8 phases (BUILD_PHASES.md). Demo milestone (triggers 40% payment): end of Phase 4 + task 5.1 — client can create, issue, preview/print, and record payment. Client's requested 2-week compression is noted but not committed; quality of financial correctness work (Phase 1) is not compressible.

**Gate before Phase 0:** the review workflow in REVIEW_PROMPTS.md (Fable review → Codex cross-check → adjudication → approved changes applied).

## 10. Risks (top level — full register produced in review phase)

1. **Client answers pending (Q-01…Q-17)** — blocked tasks marked in BUILD_PHASES.md; build configurable, never assume. Arabic print requirement (Q-08) is the biggest scope wildcard.
2. **Scope creep via relationship dynamics** — the agreement + this plan's scope section are the defense; additions are chargeable.
3. **Payment delays** — mitigated by 30/40/40 milestone structure tied to demonstrable software.
4. **Numbering/immutability bugs** — the reputation-enders; mitigated by DB-level enforcement + concurrency tests as explicit "done" criteria (tasks 1.2).
5. **Solo-operator bus factor** — handover terms, documented runbook at delivery (task 7.5), client owns domain.
6. **VAT deregistration mid-project** — already designed for (D-16); only Settings defaults change.
