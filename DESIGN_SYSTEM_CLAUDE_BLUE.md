# DESIGN_SYSTEM_CLAUDE_BLUE.md
## Invoice System UI/UX — "Warm Paper / Federal Blue"
Version 1.0 · Supersedes the "Stamped Paper" visual direction in SCHEMA_DESIGN.md / PROJECT_PLAN.md where they conflict. Financial invariants (immutability, gapless numbering, fils storage) are unchanged — this doc is visual/interaction layer only.

---

## 0. Instructions to Claude Code (read first)

1. This document is the single source of truth for all UI decisions. When any earlier doc (PROJECT_PLAN.md, SCHEMA_DESIGN.md "Stamped Paper" section) conflicts with this file, THIS FILE WINS.
2. Implement tokens as CSS variables in `app/globals.css` and map them into Tailwind via `tailwind.config.ts` (`colors: { ... : 'var(--...)' }`). Never hardcode hex values in components.
3. Theme shadcn/ui by overriding its CSS variables (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--radius`, etc.) to the values in §2. Do not fork component internals unless required.
4. Respect `prefers-reduced-motion` on every animation (§8).
5. The accent color has exactly one job: primary actions + brand identity + active states. Never use it for body text, large backgrounds, or decoration.
6. Keep the existing invariant: all monetary values render in JetBrains Mono, tabular numerals.
7. Do NOT copy Anthropic's logo, wordmark, or proprietary fonts. This is an "inspired-by" system with our own assets.

---

## 1. Design Philosophy

The feel: a calm, warm sheet of paper with quiet, precise typography — not a glowing dashboard. Interfaces like this earn trust for financial software.

- **Warm, not white.** Backgrounds are ivory/cream in light mode and warm charcoal (never pure black) in dark mode.
- **One voice of authority.** A serif display face for page titles and key numbers gives an editorial, "printed document" character. Everything else is a quiet sans.
- **Hairlines, not boxes.** Separation comes from 1px warm-toned borders and whitespace, not shadows or filled containers. Shadows appear only on floating layers (drawers, popovers, dialogs).
- **The accent is rare.** Federal Blue appears on maybe 5% of any screen: the primary button, active nav pill, toggles, links, focus rings, chart lines. Its rarity is what makes it read as "the" action.
- **Numbers are sacred.** Money and invoice numbers always in mono, tabular, right-aligned in tables.

---

## 2. Color Tokens

### 2.1 Light mode (default)

```css
:root {
  /* Base surfaces */
  --bg:              #FAF9F5;   /* app background — warm ivory */
  --bg-sunken:       #F5F4EF;   /* sidebar, wells, input backgrounds */
  --surface:         #FFFFFF;   /* cards, sheets, dialogs */
  --surface-raised:  #FFFFFF;   /* popovers, dropdowns (with shadow) */

  /* Text */
  --text:            #29261B;   /* primary — warm near-black */
  --text-secondary:  #6E6B60;   /* descriptions, meta */
  --text-tertiary:   #9A968A;   /* placeholders, disabled, timestamps */
  --text-inverse:    #FAF9F5;

  /* Borders */
  --border:          #E8E6DC;   /* hairlines, dividers, card edges */
  --border-strong:   #D6D3C6;   /* input borders, table header rule */

  /* Accent — Federal Blue */
  --accent:          #1D4ED8;   /* primary actions, links, active */
  --accent-hover:    #1E40AF;
  --accent-pressed:  #1E3A8A;
  --accent-soft:     #EFF4FE;   /* selected-row tint, soft badges */
  --accent-border:   #BFD3F8;   /* border of soft badges */
  --on-accent:       #FFFFFF;

  /* Semantic (invoice domain) */
  --success:         #15803D;   /* Paid */
  --success-soft:    #EDF7EF;
  --warning:         #B45309;   /* Partially paid / pending */
  --warning-soft:    #FBF3E7;
  --danger:          #C2410C;   /* Overdue ONLY — kept from Stamped Paper */
  --danger-soft:     #FBEFE7;
  --neutral-soft:    #F0EFE9;   /* Draft badge */

  /* Focus */
  --ring:            #1D4ED8;   /* 2px ring + 2px offset of --bg */
}
```

### 2.2 Dark mode (`.dark`)

```css
.dark {
  --bg:              #262624;   /* warm charcoal — never #000 */
  --bg-sunken:       #1F1E1D;
  --surface:         #2B2A27;
  --surface-raised:  #30302E;

  --text:            #F5F4EF;
  --text-secondary:  #B8B5AA;
  --text-tertiary:   #85826F;
  --text-inverse:    #29261B;

  --border:          #3A3935;
  --border-strong:   #4A4943;

  --accent:          #3B82F6;   /* brighter blue for dark contrast */
  --accent-hover:    #60A5FA;
  --accent-pressed:  #2563EB;
  --accent-soft:     #1E2A44;
  --accent-border:   #2C4370;
  --on-accent:       #FFFFFF;

  --success:         #4ADE80;
  --success-soft:    #17281C;
  --warning:         #F59E0B;
  --warning-soft:    #2C2415;
  --danger:          #F97316;
  --danger-soft:     #2E1D12;
  --neutral-soft:    #33322E;

  --ring:            #3B82F6;
}
```

### 2.3 Usage rules
- `--accent` never appears as text smaller than 13px except links.
- `--danger` (burnt orange) is reserved exclusively for OVERDUE state — no generic errors. Form validation errors use a muted red `#B91C1C` (add as `--error` if needed).
- Status badge = soft background + strong text + 1px border of the soft family. Never solid-filled badges.

---

## 3. Typography

### 3.1 Font stack (all self-hosted via `next/font`)

| Role | Font | Stand-in for | Usage |
|---|---|---|---|
| Display serif | **Source Serif 4** | Copernicus | Page titles, dashboard hero numbers, empty-state headlines, invoice document title |
| UI sans | **Inter** | Styrene | Everything else: body, labels, buttons, tables, nav |
| Numeric mono | **JetBrains Mono** | — | ALL money, invoice numbers, dates in tables, TRN |

Load with `display: swap`. Enable `font-feature-settings: "tnum" 1` (tabular numbers) on Inter and JetBrains Mono wherever numbers appear in columns.

### 3.2 Type scale

| Token | Size/line | Font | Weight | Use |
|---|---|---|---|---|
| display-xl | 34/40 | Serif | 600 | Dashboard hero figure ("AED 42,180.00") |
| display | 26/32 | Serif | 600 | Page titles ("Invoices", "Customer Ledger") |
| title | 18/26 | Sans | 600 | Card titles, drawer titles, section headers |
| body | 15/23 | Sans | 400 | Default text |
| body-strong | 15/23 | Sans | 550 | Emphasis, table primary cell |
| small | 13/19 | Sans | 400 | Meta, descriptions, badge text |
| caption | 12/16 | Sans | 500, letter-spacing 0.04em, uppercase | Table headers, group labels ("SETTINGS", "THIS MONTH") |
| money | 15/23 | Mono | 500 | Money in tables/forms |
| money-lg | 22/28 | Mono | 600 | Invoice totals |

Rules:
- Serif is used sparingly — one display element per screen maximum, plus the printed invoice title. If everything is serif, nothing is.
- Sidebar group labels ("Settings", "Reports") use `caption` style in `--text-tertiary` — exactly like the Claude settings sidebar.
- Never use font-weight 700+ in Inter; 600 max keeps the calm feel.

---

## 4. Layout, Spacing, Radius, Elevation

### 4.1 Shell
```
┌──────────┬─────────────────────────────────────┐
│ Sidebar  │  Content area                        │
│ 240px    │  max-width 1040px, centered,         │
│ --bg-    │  padding 32px (desktop) / 16px (mob) │
│ sunken   │  background --bg                     │
└──────────┴─────────────────────────────────────┘
```
- Sidebar: `--bg-sunken`, right hairline `--border`, 8px inner padding, nav items are full-width pills.
- Content sections separated by hairline `--border` dividers, 32px vertical rhythm — the Claude settings-page pattern: `caption/section header → rows of [label+description | control] separated by hairlines`.

### 4.2 Spacing scale
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Never invent in-between values.

### 4.3 Radius
```css
--radius-sm:   8px;    /* inputs, badges, small buttons */
--radius-md:   12px;   /* cards, dropdown menus */
--radius-lg:   16px;   /* dialogs, drawers */
--radius-full: 999px;  /* pills: nav items, toggles, filter chips, primary buttons */
```
Primary buttons and nav items are FULL PILLS — this is a core part of the Claude look.

### 4.4 Elevation (only on floating layers)
```css
--shadow-popover: 0 4px 16px rgba(41,38,27,0.08), 0 1px 3px rgba(41,38,27,0.06);
--shadow-drawer:  0 8px 40px rgba(41,38,27,0.14);
/* dark mode: same geometry, rgba(0,0,0,0.4) */
```
Cards on the page get NO shadow — hairline border only.

---

## 5. Components

### 5.1 Buttons
| Variant | Style |
|---|---|
| Primary | pill, `--accent` bg, `--on-accent` text, 15px/550, height 38px, padding 0 18px. Hover `--accent-hover`, pressed `--accent-pressed` + scale(0.98) |
| Secondary | pill, transparent bg, 1px `--border-strong`, `--text`. Hover: bg `--bg-sunken` |
| Ghost | pill, no border. Hover: bg `--bg-sunken` |
| Destructive | secondary style but text+border in danger family; solid red only inside a confirm dialog |
| Icon button | 34px square, `--radius-sm`, ghost behavior |

One primary button per view region, maximum.

### 5.2 Inputs & forms
- Height 38px, `--radius-sm`, bg `--surface` (light) / `--bg-sunken` (dark), 1px `--border-strong`.
- Focus: border becomes `--accent` + 3px soft ring `rgba(29,78,216,0.15)`. No harsh outlines.
- Labels: `small` weight 500, 6px above input. Descriptions under label in `--text-secondary` — the Claude "label + gray description" row pattern.
- Money inputs: JetBrains Mono, right-aligned, "AED" prefix in `--text-tertiary`.
- Errors: 13px `--error` text below input, border turns error color. No red backgrounds.

### 5.3 Toggle (Switch)
Exactly like the screenshot: 40×22px pill track. Off: `--border-strong` track. On: `--accent` track, white 18px knob, knob slides 150ms ease-out. Used in settings for booleans.

### 5.4 Segmented control
Pill group like "System | Reduced" in Claude settings: container bg `--bg-sunken`, radius full; active segment = `--surface` bg + hairline border + `--text`; inactive = `--text-secondary`. Use for Invoice status filters (All / Draft / Issued / Paid / Overdue) and light/dark toggle.

### 5.5 Sidebar navigation
- Item: full-width pill, 34px height, icon 16px + label 14px/500, `--text-secondary` default.
- Hover: bg `--neutral-soft`.
- Active: bg `#E9E7DD` (light) / `#33322E` (dark), text `--text`, weight 550 — the soft-gray active pill from the screenshot, NOT a blue fill.
- Group labels above item clusters: caption style, `--text-tertiary`, 12px top margin.
- Sections: Overview (Dashboard), Documents (Invoices, Quotations), People (Customers, Ledger), System (Reports, Settings).

### 5.6 Cards & stat tiles
- `--surface`, 1px `--border`, `--radius-md`, 20px padding.
- Stat tile: caption label ("COLLECTED THIS MONTH") → serif display number → small trend line: `↑ 12.4%` in `--success` or `↓` in `--danger`, mono, vs-last-month text in `--text-tertiary`.

### 5.7 Tables (TanStack)
- Header: caption style on hairline-bottom `--border-strong`, bg transparent.
- Rows: 48px, hairline `--border` separators, no zebra. Hover bg `--bg-sunken`. Selected: `--accent-soft` + 2px left `--accent` bar.
- Money columns: mono, tabular, right-aligned. Invoice number: mono, `--text`, weight 500.
- Status badges per §2.3: Draft (neutral), Issued (accent-soft), Paid (success-soft + "Paid · sealed" with 12px lock icon — invariant kept), Partially Paid (warning), Overdue (danger).
- Row actions: ghost icon button revealed on hover.

### 5.8 Drawer (invoice preview — shadcn Sheet)
- Right slide-over, 560px, `--surface`, `--radius-lg` on left corners, `--shadow-drawer`, backdrop `rgba(41,38,27,0.35)` + 4px blur.
- Enter: 300ms cubic-bezier(0.32, 0.72, 0, 1). Exit: 200ms.
- Confirm-at-issue step lives here (invariant kept): primary "Issue invoice" pill + secondary "Keep editing".

### 5.9 Dialogs, dropdowns, toasts, empty states
- Dialog: 440px, `--radius-lg`, title `title` style, actions right-aligned (ghost cancel + primary confirm).
- Dropdown: `--surface-raised`, `--radius-md`, popover shadow, items 34px with 8px-radius hover in `--bg-sunken`; destructive items in danger text.
- Toast: bottom-right, `--surface-raised` pill-ish card, 13px, icon in semantic color, auto-dismiss 4s, slide+fade 200ms.
- Empty state: centered, 40px muted icon, serif `title` headline, small description, one primary pill. Inviting, not apologetic ("No invoices yet — create your first one.").

### 5.10 Charts / trends (recharts)
- Line/area: single `--accent` line 2px, area fill = accent at 8% → 0% vertical gradient. Dots hidden; 4px accent dot on hover.
- Grid: horizontal only, `--border`, dashed 3-3. No vertical gridlines. Axis text 12px `--text-tertiary`; no axis lines.
- Tooltip: `--surface-raised` card, popover shadow, mono values.
- Bars: `--accent` at 85% opacity, 6px top radius, hover 100%.
- Multi-series max 2: second series `--text-tertiary` dashed. Never rainbow palettes.

### 5.11 Printed invoice (browser print CSS)
The printed document stays paper-native: white bg, `--text` ink, serif for the "TAX INVOICE" title and totals, mono numerics, hairline table rules, Federal Blue only for the business-name mark and a thin rule under the header. Two-fee-column layout (Government Fee / Service Fee) unchanged pending client confirmation.

---

## 6. Iconography
- Lucide icons only, 16px in nav/buttons, 20px standalone, stroke 1.75.
- Icons inherit text color; never accent-colored except inside the active/primary context they sit in.

---

## 7. Voice & microcopy
- Sentence case everywhere ("Create invoice", not "Create Invoice").
- Buttons say what happens: "Issue invoice", "Record payment", "Send reminder" — never "Submit"/"OK".
- Action names persist: button "Issue invoice" → toast "Invoice issued".
- Errors state the fix: "TRN must be 15 digits" not "Invalid input".
- No exclamation marks. Calm, plain, specific.

---

## 8. Motion
```css
--ease-out:    cubic-bezier(0.32, 0.72, 0, 1);
--dur-fast:    150ms;  /* hovers, toggles, focus */
--dur-med:     200ms;  /* dropdowns, toasts, dialogs */
--dur-slow:    300ms;  /* drawers */
```
- Hover/pressed: background + color transitions only, 150ms. Pressed adds scale(0.98) on pills.
- Dropdowns/dialogs: fade + 4px translate-up, 200ms.
- Page content: single 250ms fade + 8px rise on route change — one orchestrated moment, no staggered per-card animation.
- Number changes on stat tiles: 400ms count-up, once per load.
- `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition-duration: 0.01ms !important; } }` — mirrors the Motion "System/Reduced" setting; expose the same setting in our Settings page with a segmented control.
- No skeleton shimmer; use static `--neutral-soft` blocks with a 150ms fade-out.

---

## 9. Accessibility floor
- Contrast: `--text` on `--bg` ≈ 13:1; `--accent` on white 6.3:1 (AA for UI + normal text). Verify all soft-badge text/bg pairs ≥ 4.5:1.
- Visible focus ring (2px `--ring`, 2px offset) on ALL interactive elements, keyboard-navigable tables and drawer (focus trap + Esc closes).
- Hit targets ≥ 34px; toggles labelled via `aria-label` or associated text.

---

## 10. Migration checklist for Claude Code

1. `globals.css`: replace Stamped Paper variables with §2 tokens; add `.dark` block; wire shadcn variables (`--primary: var(--accent)`, `--radius: 0.75rem`, etc.).
2. `tailwind.config.ts`: map token names; add font families (`serif: Source Serif 4`, `sans: Inter`, `mono: JetBrains Mono`).
3. `app/layout.tsx`: load fonts via `next/font/google` (Source Serif 4, Inter, JetBrains Mono), `display: swap`.
4. Rebuild in order: Button → Input/Label → Switch → Segmented → Badge → Sidebar → Table → Card/StatTile → Drawer → Dialog → Toast → Charts → Print CSS.
5. Sweep for hardcoded hex values / old `#0a0d12` / cool-gray tokens; replace with variables.
6. Remove Roman-numeral row indices and stamp-style decorations from the app UI (they may remain on the PRINTED invoice only, if desired).
7. Verify: light + dark screenshots of Dashboard, Invoice list, Invoice drawer, Settings; run axe or Lighthouse a11y pass; test print preview.
8. Do not touch: `issue_invoice()` function, immutability triggers, fils storage, invoice_events — visual layer only.

---

*End of design system. When in doubt: warmer, quieter, fewer colors, one blue.*
