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
- **Global `pnpm` on this machine broke again** (upgraded past Node 20 compatibility;
  `ERR_UNKNOWN_BUILTIN_MODULE`). Workaround used: `corepack pnpm …`, which honors the
  repo's pinned `packageManager: pnpm@9.15.9`. Permanent fix: re-pin the global pnpm
  to 9, or upgrade the machine to Node 22.
