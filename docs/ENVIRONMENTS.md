# Environments — how many, where, and who wires them

**Written 2026-08-10**, after the system went live and the question came up:
*"do I need staging and production only in Vercel, or in Supabase too?"*

Short answer: **two databases in Supabase, one project in Vercel.** The
intuition usually runs the other way, so the reasoning is below.

---

## 1. Supabase needs two databases

Not for tidiness. For three concrete reasons that all point the same way:

- **The test suites are destructive.** All 25 `pnpm test:db:*` files `TRUNCATE`
  tables to build their fixtures.
- **Migrations are append-only** (CLAUDE.md §2) and must be rehearsed somewhere
  before they touch the ledger.
- **Issued invoices are immutable by database trigger** (§3.1). A mistake
  against the live database cannot be undone — only worked around with a new
  document.

So the requirement is not "environments as best practice". It is: *there must
be a database you are allowed to break.* Today there isn't one, which is why
`db/guard.mjs` currently refuses every destructive script — correctly, and with
nowhere else to send them.

## 2. Vercel does not need two projects

Vercel already gives you a staging front end for free: **every branch and pull
request gets its own preview deployment** with its own URL, built from the same
project. A second Vercel project would duplicate that and double the
configuration surface for nothing.

What matters in Vercel is not project count but **which database each
environment talks to**. Vercel scopes environment variables per environment, so
one variable name can hold different values:

| Vercel environment | Supabase database | Why |
|---|---|---|
| **Production** | production (live ledger) | the shop |
| **Preview** (branches / PRs) | **staging** | an untested branch must never reach real invoices |
| **Development** (local `pnpm dev`) | **staging** | same reason |

This is what BUILD_PHASES 0.4 specified originally — *"envs pointed at the
staging Supabase project for previews, production env vars reserved for the
production deploy."* It was never completed.

## 3. "Development" does not need a third database

For a ten-person single-tenant app, three databases is overkill. Local
development points at the **staging** database. If two people ever need to work
without colliding, that is the moment to add a third — not before.

So the real count is **two databases, three Vercel environments.**

## 4. Current reality (and the trap)

Both Supabase projects were created deliberately at project start
(BUILD_PHASES 0.2). **The cutover between them never ran**, so:

| Project | What it actually is |
|---|---|
| `inovice staging` — ref `kxtbxgcvwxvlsoygjvvi` | **PRODUCTION.** The live ledger. |
| `inovice-system-production` | **Empty**, paused 2026-08-10 for inactivity. The staging database we are missing. |

The names are inverted, and that inversion is exactly what silently flipped all
25 test guards (audit F-3). **Rename both to match reality before anything
else** — every instruction below is safer once the labels stop lying.

**Do not cut the live ledger over to the other project.** It holds sealed
invoices and staff are working in it; migrating buys a tidier name and risks
the record.

## 5. The risk to check first

Vercel's **Production** environment currently holds the credentials of what is
now the live database. What is unverified is whether **Preview** has its own
values or falls back to the same ones.

If previews point at the live database, **opening a pull request deploys an
untested branch that can write to the client's real ledger** — and sealed
invoices cannot be deleted. This is a two-minute check in
Vercel → Settings → Environment Variables: look at the environment scope on
each Supabase variable.

## 6. Who wires what

The split is not about trust — it is about which credentials exist on which
machine. This machine has no Vercel access (`whoami` → Not authorized, API →
403) and no access to the paused Supabase project.

| # | Step | Who | Why |
|---|---|---|---|
| 1 | Rename both Supabase projects so names match reality | **Owner** | dashboard only |
| 2 | Resume `inovice-system-production`, to become staging | **Owner** | dashboard only |
| 3 | Copy its **session pooler URL (`:5432`)**, **project URL** and **anon key** into `.env.staging.local` | **Owner** | secrets never leave the dashboard by any other route |
| 4 | Add `DB_ENV=staging` to that file | Either | one line |
| 5 | Run `pnpm db:migrate` against staging (0000–0018) | **Claude** | scripted, verifiable |
| 6 | Seed it — `pnpm db:seed -- --demo` | **Claude** | guard now permits it |
| 7 | Prove the test suite runs again (`pnpm test:db:1.2a` etc.) | **Claude** | this is the whole point of step 2 |
| 8 | In Vercel, scope Supabase vars: Production → live, Preview + Development → staging | **Owner** | dashboard only |
| 9 | Add `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` to Vercel Production, redeploy | **Owner** | dashboard only |
| 10 | Update `.env.example` and this document to match | **Claude** | repo |

Steps 1–3 are perhaps ten minutes of dashboard clicking. Everything after them
is scripted work that can happen unattended.

## 7. What this costs

**Nothing.** Both Supabase projects sit on the free plan, and Vercel previews
are included. Free organisations cap how many projects may be active at once,
so resuming the second one is the moment to confirm you are inside that
allowance — two is the normal free allowance, and two is what exists.

## 8. How the guard interacts

`db/guard.mjs` (audit F-3) refuses any destructive script unless the target
database is *positively identified as disposable*:

- the production ref is refused outright, with **no override**;
- anything else must declare itself with `DB_ENV=staging|development|test`, or
  be a localhost connection.

So once step 4 is done, the test suites work again with no code change. And if
someone ever points `.env.staging.local` at production by mistake, the guard
refuses rather than truncating the ledger — which is precisely the failure it
was built for.
