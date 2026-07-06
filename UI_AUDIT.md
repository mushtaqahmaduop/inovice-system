# UI_AUDIT.md — teardown before the redesign

Per PREMIUM_EXECUTION_GUIDE §1.1. Produced 2026-07-07 from live screenshots of
every screen (light + dark, 1440 + 390 — 30 shots, gallery artifact linked in
the PR) plus code sweeps. **This is the punch list: nothing here may survive to
the final build.**

---

## P0 — the app renders in Times New Roman. Everywhere. In production.

`globals.css` declares `html { @apply font-sans; }`, but `--font-sans` is
defined by next/font's variable **class on `<body>`** — one element too deep.
On `<html>` the `var(--font-sans)` is undefined, the declaration fails at
computed-value time, and font-family falls back to the browser serif default.
Confirmed on production with a font probe: `h1` computes to
`"Times New Roman"`; every Inter Tight face reports `unloaded`. Only `.mono`
elements (JetBrains Mono, resolved *inside* body) ever load their font.

Every screenshot in the gallery shows it: all UI text is Times. This single
bug is a large share of "the UI looks basic." Fix lands in the tokens slice
(fonts get rewired for Inter + Source Serif 4 anyway); the lesson is
structural: **font-family must be declared at or below the element carrying
the variable classes.**

## Typography census

- **19 distinct arbitrary px sizes** (8, 8.5, 9, 10, 10.5, 11, 11.5, 12, 12.5,
  13, 13.5, 14, 15, 16, 17, 20, 26, 28, 34) across **~330 `text-[Npx]`
  usages** in app/components — vs the design system's 9-token scale (§3.2).
  Replace all with the scale; delete the arbitrary values.
- 9px/8px uppercase-letterspaced micro-labels are everywhere (below the 12px
  caption floor — squint-test failure: meta noise competes with data).
- No display face at all (titles are 20px semibold sans — was meant to be, is
  actually Times). New system: Source Serif 4 display, one per screen.

## Component-level punch list

| # | Finding | Where | Design-system target |
|---|---|---|---|
| 1 | 6 native `<select>` elements, OS-styled, inconsistent with inputs | invoices filters ×2, users, settings, payments, customers | shadcn Select / segmented control (§5.4) for status filters |
| 2 | Native date inputs render `mm/dd/yyyy` US-style, browser chrome | invoices filters, editor, payments | styled date input; table dates as `07 Jul 2026` mono (§2.3) |
| 3 | Buttons are small rectangles (radius 2px), no pressed state, 28px tall | everywhere | pill buttons, 38px, 5 states (§5.1, §2.4) |
| 4 | Status chips 9px uppercase, hairline-only; overdue is the sole filled one | tables, sealed view | soft-bg + strong-text + soft-border badges (§2.3) |
| 5 | Sidebar: active = blue left-bar + tint; 8px "OFFICIAL REGISTRY" microcopy; "STAMPED PAPER" footer; ADM tags | shell | soft-gray active pill, caption group labels, drop stamp decorations (§5.5, §10.6) |
| 6 | Roman numeral row indices (`№ I II III`) | invoices, dashboard debtors | remove from app UI (print may keep) (§10.6) |
| 7 | Topbar `LDG/2026/07/06` stamp ref + "LIGHT/DARK" text-button theme toggle | shell | drop stamp ref; segmented System/Light/Dark control (§5.4) |
| 8 | Dates in tables are raw ISO `2026-07-06`; activity timestamps `07-06 20:05` | invoices, dashboard, ledger | `07 Jul 2026` mono; relative time only in feeds w/ tooltip (§2.3) |
| 9 | Negative amounts use minus sign | ledger, payments | parentheses `(AED 500.00)`, `--text-secondary` (§2.3) |
| 10 | No toasts — success/error is inline text that shifts layout | settings, editor, payments | sonner, named actions ("Invoice INV-0042 issued") (§5.9) |
| 11 | Ctrl+K search exists but is minimally styled, entities only | global-search | cmdk palette incl. actions, `--surface-raised` (§2.4 libs) |
| 12 | No charts, no trend indicators anywhere | dashboard | one 2-series chart + stat-tile trends (recharts §5.10) |
| 13 | Dashboard: 60% dead whitespace below the fold; hero figure is a stat tile like the others | dashboard | serif hero (outstanding), 3–4 tiles + NumberFlow, needs-attention list (guide §4) |
| 14 | Editor: full-width field dump; totals panel floats mid-air right; Tab flow through line grid unverified | invoice editor | document-shaped ≤760px form, Tab flow qty→…→new row (guide §4, §2.6) |
| 15 | Issue flow preview is a Sheet, but backdrop/radius/motion are defaults | invoice editor | §5.8 drawer spec; Vaul bottom sheet <768px |
| 16 | Empty states are one-line gray sentences | all tables | icon + serif headline + primary action (§5.9) |
| 17 | Table rows 42px, header on gray band; no hover-reveal actions; whole-row click only on invoices | all tables | 48px rows, transparent caption header, hover-reveal ghost actions (§5.7) |
| 18 | Focus rings exist (shadcn) but inconsistent on native selects/links | mixed | one `--ring` treatment on ALL interactives (§9) |
| 19 | Mobile: 64px icon rail is bare; tables became stacked cards (fine) but drawer isn't a bottom sheet | shell, invoices | keep rail, restyle to tokens; Vaul sheet (§2.5 libs) |
| 20 | `prefers-reduced-motion` not handled anywhere (no animations exist yet either) | global | §8 motion rules + Settings control |

## State gaps (screens missing designed states)

Mostly covered by earlier passes (loading skeleton, error boundaries, empty
states, styled 404s all exist) — the redesign restyles rather than invents:
- Buttons lack loading spinners in: customer dialog, service form, void
  controls (text swaps only, no spinner, no width stability).
- No optimistic UI anywhere (payments could use it — guide §2.5).
- Scroll/filter state is lost returning from a sealed view to the list.

## Already compliant (keep, restyle only)

- Money: integer-fils math, always 2 decimals, mono, right-aligned in tables
  (`lib/money.ts` is sound — wrap presentation, don't touch math).
- Hairline-not-boxes philosophy already present; dark tokens structurally
  complete; no gradients, no shadows on cards, no emoji, no rainbow anything.
- Empty/loading/error/404 states exist on every screen (restyle to §5.9).
- The printed invoice document is EXEMPT from the redesign (client's sample
  layout, their explicit instruction) — §5.11 of the design doc does NOT apply.

## Conflicts resolved before building (recorded)

1. CLAUDE.md §5 "no serif" → superseded by DESIGN_SYSTEM_CLAUDE_BLUE.md
   (owner decision); CLAUDE.md to be amended in the tokens slice.
2. LIBRARIES_GUIDE §4 (resend/react-email) → NOT installed; the client
   deleted invoice emailing (DECISIONS.md, 2026-07-05).
3. DESIGN_SYSTEM §5.11 print restyle → skipped (client sample layout wins).
4. `tailwind.config.ts` instructions → adapted to Tailwind v4 CSS-first
   `@theme` (this repo has no config file by design).
5. "Quotations" nav item (§5.5) → omitted; no such feature exists.

## Build order from here (guide §1.2)

1. `redesign/01-tokens` — §2 tokens, Inter + Source Serif 4 + JBM (fonts
   FIXED at body level), dark block, shadcn variable wiring, CLAUDE.md §5
   amendment. Verify with a bare token test page.
2. `redesign/02-kitchen-sink` — `/dev/kitchen-sink`: every primitive, every
   state, both themes; screenshot = the contract.
3. Shell → invoice list end-to-end → dashboard → editor → drawer → customers
   → ledger → settings → auth → polish pass → QA pass.
