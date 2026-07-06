# LIBRARIES_GUIDE.md
## Approved Free Libraries — Invoice System (Warm Paper / Federal Blue)
Companion to DESIGN_SYSTEM_CLAUDE_BLUE.md. Rule of the project: LEAN STACK. Every dependency must justify itself. If native CSS / the platform / an existing dep can do it, do NOT add a library.

---

## 0. Instructions to Claude Code

1. Only libraries in §1–§7 may be added. Anything else requires explicit approval from Mushtaq first.
2. Everything listed is MIT/OSS and free — no paid tiers required for our usage.
3. Check bundle impact: run `pnpm dlx @next/bundle-analyzer` after adding anything. First-load JS for the dashboard route must stay under 220 kB gzipped.
4. Prefer dynamic `import()` for anything used on one route only (charts, PDF/print helpers, command palette).

---

## 1. Already in stack — keep, do not replace

| Library | Role | Note |
|---|---|---|
| next@15 (App Router) | framework | Server Components by default; `"use client"` only where interaction demands |
| tailwindcss + shadcn/ui | styling/components | theme via the CSS variables in DESIGN_SYSTEM §2 |
| @tanstack/react-table | tables | headless; style per DESIGN_SYSTEM §5.7 |
| react-hook-form + zod | forms/validation | zod schemas shared client+server |
| zustand | client state | UI-only state (drawer open, filters); server data stays in RSC/fetch |
| lucide-react | icons | import icons individually, never `import *` |
| drizzle-orm | DB | — |
| @supabase/supabase-js | auth/db/storage | — |

---

## 2. Premium look — approved additions

### 2.1 `motion` (Framer Motion, now "Motion") — animations
- Use ONLY for: drawer/dialog enter-exit, page-content fade-rise (DESIGN_SYSTEM §8), layout animation when a filtered table re-sorts.
- Hovers/toggles/focus stay pure CSS transitions — do not mount Motion for those.
- Import from `motion/react`, use `LazyMotion + domAnimation` to keep it ~15 kB instead of ~34 kB.
- Wrap everything in `useReducedMotion()` checks.

### 2.2 `@number-flow/react` — animated numerics
- The single biggest "premium" upgrade for a finance app: smooth digit-roll transitions on stat tiles and invoice totals when values change.
- ~5 kB, respects reduced motion automatically, works with tabular JetBrains Mono.
- Use on: dashboard hero figure, stat tiles, drawer total. NOT inside table rows (perf).

### 2.3 `sonner` — toasts
- shadcn's recommended toast. Style to DESIGN_SYSTEM §5.9 via its `toastOptions.classNames`. Replaces any hand-rolled toast.

### 2.4 `cmdk` — command palette (⌘K)
- Instant premium feel: press ⌘K → jump to invoice #, customer, or action ("Create invoice", "Record payment").
- Dynamic-import it; it should not be in the first-load bundle.
- Style as a `--surface-raised` dialog per DESIGN_SYSTEM §5.9.

### 2.5 `vaul` — mobile bottom sheet
- On <768px, the invoice preview drawer becomes a Vaul bottom sheet (native-app feel with drag-to-close). Desktop keeps shadcn Sheet. Same content component, two shells.

### 2.6 `@formkit/auto-animate` — micro list transitions
- 2 kB. Apply to: payments list inside the drawer, line-items editor rows. Adds smooth add/remove without writing animation code. Do NOT apply to the main invoice table.

### 2.7 `recharts` — charts
- Already the plan; confirm styling per DESIGN_SYSTEM §5.10. Dynamic-import the dashboard chart block (`next/dynamic`, `ssr: false`) — recharts is the heaviest UI dep we allow.

---

## 3. Performance — approved additions

| Library | Why |
|---|---|
| `@tanstack/react-virtual` | Virtualize the customer ledger table when a customer has 200+ rows. Only mount when row count > 100. |
| `@next/bundle-analyzer` (dev only) | Run after each phase; enforce the 220 kB budget. |
| `sharp` | Auto-used by `next/image` on Vercel — ensure all images (logo, stamps) go through `next/image`. |

Native/platform features to use INSTEAD of libraries:
- **Currency formatting:** `Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' })` wrapped in our own `fmtAED(fils)` util. NO dinero.js, NO accounting.js — money is already fils bigint with our invariants.
- **Dates:** prefer native `Intl.DateTimeFormat`. If manipulation is genuinely needed (due-date math), `date-fns` (tree-shakeable, import per-function) — never moment/dayjs.
- **IDs:** `crypto.randomUUID()` — no uuid package.
- **Debounce/utils:** write the 5-line util — no lodash.
- **Fonts:** `next/font/google` — zero layout shift, self-hosted automatically.
- **View transitions:** CSS `@view-transition` where supported, as progressive enhancement — free polish, zero kB.

---

## 4. Email (already planned, confirming)

| Library | Role |
|---|---|
| `resend` + `@react-email/components` | Invoice email + payment reminder templates as React components. Style emails with inline warm-paper palette (email clients ignore CSS variables — hardcode hex THERE only). |

---

## 5. Quality / DX (dev-only, free)

| Library | Role |
|---|---|
| `prettier` + `prettier-plugin-tailwindcss` | class sorting — keeps Tailwind readable |
| `eslint-config-next` | already included |
| `@axe-core/react` (dev) | a11y floor check per DESIGN_SYSTEM §9 |

---

## 6. Explicitly BANNED — do not install, even if a tutorial suggests it

| Library | Why banned |
|---|---|
| moment, dayjs | dead weight; native Intl + date-fns cover us |
| lodash (full) | tree-shaking traps; write utils |
| styled-components / emotion | conflicts with Tailwind approach, runtime cost |
| MUI, Ant Design, Chakra, Mantine | fights shadcn + the design system entirely |
| GSAP | overkill; `motion` covers everything we animate |
| three.js / spline / particles | not a portfolio site — this is finance software |
| redux / redux-toolkit | zustand is the decision, locked |
| axios | native fetch |
| react-icons | lucide only, one icon language |
| @react-pdf/renderer | already removed from plan — print CSS only |
| Any UI "template kit" (shadcn blocks are fine; paid template repos are not) | licensing + design drift |

---

## 7. Decision test for any future library

Before adding ANYTHING, answer all four in a code comment in the PR/commit:
1. What does it do that platform/native/existing deps cannot?
2. Gzipped size, and is it dynamic-importable?
3. Is it maintained (commit in last 6 months) and MIT/Apache licensed?
4. Which DESIGN_SYSTEM section does it serve?

If any answer is weak — don't add it. The premium feel of this app comes from the design system's discipline (warm palette, hairlines, one blue, mono numbers, restrained motion), not from dependencies.
