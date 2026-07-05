# UI/UX Redesign Brief — Invoice Ledger ("Stamped Paper")

> Written 2026-07-05 for Google Stitch / Figma. Paste sections into the tool as
> prompts, or import wholesale. The current build is functional but visually
> flat — this brief defines what a **professional** pass looks like WITHOUT
> breaking the locked design rules below. Every screen listed exists and works
> at https://inovice-system.vercel.app — redesigns must map 1:1 onto them.

---

## 1. Product context (one paragraph the designer must internalize)

A **single-tenant invoice & customer ledger** for a UAE government-services /
typing centre (Al Ain). ~10 employees at walk-in counters, ~300 invoices a
month, bursts of speed-work with customers standing at the desk. Two audiences:
**staff** (fast repetitive entry: new invoice → issue → collect cash) and the
**owner/admin** (money overview, "who owes us", settings, exports). Invoices
become legally **immutable** once issued — the UI's job is to make "sealed"
feel physically real, like a stamped paper document. Trust and auditability
are the selling points; the design must radiate *precision*, not decoration.

## 2. Non-negotiable design rules (locked by contract — do not "improve" these)

- **Palette — light:** paper `#f6f5f2`, surface `#ffffff`, ink `#0f1419`.
  **Dark:** deep blue-black `#0a0d12`, surface `#11151c`, ink `#e6e4dd`.
- **ONE accent:** FTA federal blue `#003b5c` (dark mode `#5b95c4`) — used ONLY
  for action signals (primary buttons, active nav, links, the seal moment).
- **Burnt orange `#c2410c` is ONLY for overdue/void/warning.** Nothing else.
  Green `#15633c` only for "paid". **No other hues. No gradients. Ever.**
- **Type:** Inter Tight for UI text. **JetBrains Mono for ALL numerals** —
  amounts, invoice numbers, dates, TRNs, table figures (tabular-nums).
  **No serif fonts anywhere.**
- **Editorial signatures to keep and amplify:** Roman numeral row indices
  (I, II, III…), 0.5–1px hairline borders (`#e0ddd6` / dark `#20262f`),
  stamp-style document reference top-right, "· Sealed ·" lock indicators.
- **Vocabulary:** "sealed" = issued/immutable, independent of payment. Never
  imply an unpaid invoice is editable.
- **Radius:** small (≤4px). This is a ledger, not a consumer app.
- Invoice preview = slide-over drawer ~45–50% width. Never a permanent split.
- Both **light and dark** modes shipped; design both.
- **Coming (bilingual invoices):** printed invoice will carry English +
  Arabic. Reserve room for dual-language labels on the document design; an
  Arabic companion typeface (IBM Plex Sans Arabic / Noto Sans Arabic) will
  pair with Inter Tight.

## 3. What "unprofessional" means today — the specific problems to solve

1. **No visual hierarchy.** Every screen is uniform 12–13px text in identical
   bordered boxes. Nothing tells the eye what matters first. → Establish a
   scale: page title ~20px/600, section eyebrows (mono, letterspaced, 9–10px),
   body 13–14px, KPI numerals 24–28px mono.
2. **No breathing room.** Cards touch, paddings are minimal and equal
   everywhere. → Define a spacing scale (4/8/12/16/24/32/48) and use the big
   steps between sections, small inside components.
3. **Naked tables.** Rows are cramped, headers whisper, no zebra or hover
   affordance hierarchy, status text looks like data. → Design a proper data
   table: 40–44px rows, right-aligned mono numerals, real status **chips**
   (hairline-bordered pills: `draft` neutral / `· sealed ·` ink / `paid`
   green / `overdue` burnt orange filled), sticky header on scroll.
4. **Forms look like wireframes.** Inputs are bare rectangles; labels tiny;
   no grouping logic. → Input height 36–40px, visible focus ring in accent
   blue, grouped fieldsets with eyebrow headings, helper text style, error
   style (burnt orange text + border).
5. **Buttons lack rank.** Primary/secondary/ghost look nearly identical. →
   Primary = solid federal blue; Secondary = hairline outline; Destructive
   contexts (Void) = outline that turns burnt orange on hover; Ghost for
   table row actions only.
6. **The invoice document doesn't feel like a document.** It's the soul of
   the product and currently reads as another card. → Give it paper
   affordances: subtle elevation off the page background, generous margins,
   a real letterhead block, oversized mono invoice number, a literal stamp
   treatment for "· SEALED ·" (rotated 1–2°, hairline double-border box) and
   a burnt-orange equivalent for VOIDED.
7. **Empty/loading/error states are missing or plain text.** → Design all
   three for every list (see §6). Skeletons must mirror the real layout.
8. **Icons are inconsistent 1.4px strokes at random sizes.** → One icon set
   (the existing 16×16 1.4px line style is fine) at exactly two sizes
   (16/20), always paired with labels in nav.
9. **The sidebar wastes its chance.** → Keep structure (brand seal, LEDGER /
   RECORDS / ADMINISTRATION sections, ADM tags) but design: active item gets
   a 2px federal-blue left rail + surface tint; counts as small mono badges;
   collapsed 64px variant for small screens.
10. **Mobile is an afterthought.** Staff will use phones at the counter. →
    Design the invoice list, customer ledger, and payment recording at
    390px width. Tables become stacked cards keyed by the mono number.

## 4. Screen inventory (design ALL, in both themes)

| # | Screen | Route | Key elements |
|---|---|---|---|
| 1 | Login | `/login` | email+password, TOTP challenge variant, brand seal |
| 2 | MFA setup | `/mfa-setup` | QR enrollment, recovery codes sheet (print-friendly) |
| 3 | Dashboard | `/dashboard` | 3 KPI tiles (Outstanding leads, burnt orange), "Open balances by customer" ranked list, recent-activity feed |
| 4 | Invoice list | `/invoices` | filter bar (search/status/payment/date-range), data table, payment chips, overdue treatment, row → detail |
| 5 | Invoice editor | `/invoices/new`, `/invoices/[id]/edit` | Bill-to picker w/ walk-in quick-create, fee-column chips manager, line grid (Roman indices, per-column AED cells), live totals block, notes/terms, Save/Issue split |
| 6 | Issue preview | slide-over | full document preview, warning copy, Confirm & Issue (single-fire) |
| 7 | Sealed invoice | `/invoices/[id]` | document with stamp treatment, lineage links (replaces/replaced-by), payments panel (record form + ledger rows + reversal), event timeline rail |
| 8 | Customers | `/customers` | table w/ type tags, quick-add walk-in vs full client, admin deleted-toggle |
| 9 | Customer ledger | `/customers/[id]` | 3 balance stats, invoice table, payments list |
| 10 | Services | `/services` | catalogue cards: name, per-unit, Govt fee / Service fee mono pair, active/deleted states |
| 11 | Settings | `/admin/settings` | grouped sections (Company / VAT / Invoicing), payment-methods manager (reorder/deactivate) |
| 12 | Users | `/admin/users` | accounts table, create form, revoke/deactivate actions |
| 13 | Exports | `/admin/exports` | date range + three download rows |
| 14 | Print/A4+A5 invoice | print CSS | **DIRECTIVE 2026-07-05 (supersedes "details only"): replicate the CLIENT'S OWN sample layout exactly** (`invoice.jpg.jpeg`): logo block top-left with contact lines beneath; big INVOICE title top-right with address under; "Billed to" left vs number/date/Paid-Not-Paid right; single ruled grid (Item # / Description / Qty / Unit Price / Service Fee / Amount); Subtotal / Service Fee / Total Amount AED stacked right; Terms & Conditions + thank-you at the bottom. Bilingual EN/AR labels layer onto THIS layout if Mushtaq confirms the Arabic scope. |

## 5. Signature moments worth designing deliberately

- **The seal.** Confirm & Issue is the product's heartbeat. Design the
  press-to-seal interaction: button state → brief "sealing…" → the document
  re-renders with the stamp and allocated number. The number appearing IS
  the reward; let it land big in mono.
- **Money never lies.** Any figure the system derived (totals, balances,
  VAT) is mono + tabular. Any figure a human typed is an input. Keep the
  distinction visible.
- **Who owes us.** The owner's daily glance: rank, name, open amount in
  burnt orange, one tap to the ledger. Design this list to be readable from
  a metre away.
- **The timeline.** Dot-and-rail history (blue dot = sealed, orange = void).
  Make it feel like a notarial record, not a social feed.

## 6. States matrix (every list/table needs all four)

| State | Treatment |
|---|---|
| Loading | **Skeletons that mirror the real layout** (bars for rows, blocks for tiles) with a soft shimmer; never spinners on full pages |
| Empty | one-line editorial sentence + a single primary action (e.g. "No invoices yet — create the first one") |
| Error | hairline card, burnt-orange eyebrow, retry action, never a toast for persistent failures |
| Loaded | as designed |

## 7. Deliverables & prompts

For **Google Stitch**: feed §1–§3 as the system/style prompt, then one screen
of §4 at a time with its "Key elements" as the content list. Force the token
palette above; reject any output with gradients, serifs, or extra colors.

For **Figma**: create the token library first (colors, both themes; type
scale; spacing; hairline styles), then components (chips, table, inputs,
buttons, stat tile, timeline node, stamp), then screens.

**Handoff rule:** the implementation is Tailwind v4 + existing CSS variables
(`--paper`, `--surface[-2/3]`, `--ink[-2/3/4]`, `--hairline[-strong]`,
`--accent-action`, `--warning`, `--success`); designs must express everything
through those tokens so refinement stays a variable swap, not a rebuild.
