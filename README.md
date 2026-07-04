# Invoice System

Single-tenant invoice & customer ledger for a UAE government services / typing centre.
Next.js 15 App Router · Supabase (Postgres) · Drizzle · Tailwind + shadcn/ui · pnpm.

**Read first, every session:** `CLAUDE.md` (hard rules) → `PROJECT_PLAN.md` → `DECISIONS.md` → `SCHEMA_DESIGN.md` → `BUILD_PHASES.md`. Review history lives in `docs/`; the approved UI prototype in `reference/`.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in STAGING Supabase values
pnpm dev
```

Node 20+ with **pnpm 9**. All work happens on feature branches — never commit to `main` (CLAUDE.md §1).

## Environments & the migration drill

Two Supabase projects exist: **staging** and **production**.

| Environment | Database | Who deploys |
|---|---|---|
| Local dev | staging | you |
| Vercel preview (every branch/PR) | staging | auto on push |
| Vercel production | production | only from merged `main`, deliberately |

**The drill — staging first, always (BUILD_PHASES rule 5):**

1. Write schema changes in `db/schema.ts`, generate with `pnpm db:generate` (migrations are **append-only** — never edit an applied migration, D-07).
2. Apply to **staging**: `pnpm db:migrate` (uses `DATABASE_URL_MIGRATIONS` — the **session pooler, port 5432**; the transaction pooler on 6543 rejects drizzle-kit's prepared statements. The app itself uses `DATABASE_URL` on 6543).
3. Verify on staging (tests, preview deploy).
4. Only after merge to `main`: apply the same migrations to production.

Production migrations never run from a feature branch, and never run first.

## Money

All monetary values are **fils (AED × 100) as `bigint`** end-to-end — never floats, never `numeric` (CLAUDE.md §3.3). Display via JetBrains Mono.
