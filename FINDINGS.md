# FINDINGS.md — adjacent problems noticed during tasks (CLAUDE.md §7)

Not fixed inline; each entry needs its own decision/task.

## 2026-07-05 — task 1.2a

- **`pnpm format:check` fails repo-wide (23 files), pre-existing.** It flags files
  committed and untouched since Phase 0/task 1.1 (`app/layout.tsx`, `db/schema.ts`,
  `.prettierrc`, generated `db/migrations/meta/*.json`, …), so this predates 1.2a —
  most likely CRLF/line-ending drift on the Windows machine vs prettier's `endOfLine`
  default. Options: add `endOfLine` to `.prettierrc` + a one-shot `pnpm format` commit,
  and/or ignore `db/migrations/meta/` (generated). Worth a small `chore/` branch;
  build and eslint are unaffected.
## 2026-07-05 — GitHub Copilot performance audit (external, reviewed & dispositioned)

Copilot flagged 10 potential performance issues. Disposition after checking the code:

- **FIXED (this chore):** `db/index.ts` created the postgres client at module scope
  with no reuse guard — dev hot-reload / serverless cold-start connection churn.
  Now cached on `globalThis` with `max: 5` (transaction pooler multiplexes behind it).
- **Already handled:** "missing indexes" — `db/schema.ts` already indexes
  `invoices(status|customer_id|issue_date)`, `payments(invoice_id)`,
  `invoice_events(invoice_id)`, `invoice_lines(invoice_id)`, `customers(type)`.
- **Not a defect:** `prepare: false` is mandatory on the Supabase transaction pooler.
- **Rejected as over-engineering at ~300 invoices/month:** payment-sum summary
  table / materialized views / Redis caching (Redis forbidden by CLAUDE.md §2) /
  `invoice_events` partitioning+archival. Revisit only if EXPLAIN ANALYZE ever
  shows a problem. Note: 4.3 already plans reads through the `invoice_list` view
  (single query with derived payment status — no N+1 by design).
- **Deferred to the phases that build the surfaces:** pagination + field-trimmed
  list payloads and join-not-loop query shape are acceptance criteria for the
  Phase 3–5 list UIs (3.1, 4.3, 5.2, 5.3), not current bugs — those UIs don't
  exist yet. Carry composite indexes (e.g. `invoice_events(invoice_id, created_at)`,
  `status+issue_date`) into those tasks if query plans want them.

## 2026-07-05 — task 2.2

- **ACTION FOR MUSHTAQ — shorten the access-token TTL (#24, task 2.2).** The
  ~10-minute JWT expiry must be set in the Supabase dashboard (Authentication →
  Sessions / JWT expiry; default 3600s → 600s) on **staging and production** —
  there is no API path with this machine's credentials. Middleware-mediated
  requests already lock out revoked/deactivated users on the next request
  (proven in tests); the short TTL narrows the window for a stolen JWT used
  **directly against PostgREST**, where only expiry + RLS apply.
- GoTrue on this project has **no admin session-revocation endpoint** (404) —
  revocation deletes `auth.sessions` rows via the server DB connection instead;
  documented in `lib/auth/admin-api.ts`. Re-check when Supabase upgrades GoTrue.

## 2026-07-05 — task 1.2a

- **Global `pnpm` on this machine broke again** (upgraded past Node 20 compatibility;
  `ERR_UNKNOWN_BUILTIN_MODULE`). Workaround used: `corepack pnpm …`, which honors the
  repo's pinned `packageManager: pnpm@9.15.9`. Permanent fix: re-pin the global pnpm
  to 9, or upgrade the machine to Node 22.
