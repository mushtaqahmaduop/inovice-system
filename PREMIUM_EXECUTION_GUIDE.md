# PREMIUM_EXECUTION_GUIDE.md
## How to Execute This Redesign at a Premium, Professional Level
Companion to DESIGN_SYSTEM_CLAUDE_BLUE.md (what it looks like) and LIBRARIES_GUIDE.md (what to build with). This file is HOW to work so the result feels premium — because the current UI/UX has been rejected by the owner. Do not preserve the existing look "where convenient." Rebuild to this bar.

---

## 0. The mindset

Premium is not decoration. Premium is: nothing is accidental. Every pixel of spacing, every weight, every state (hover, focus, empty, loading, error, disabled) was decided on purpose. Cheap UIs have designed happy paths and accidental everything-else. This app is financial software for a real business — it must feel like a calm, precise instrument, not a template.

The three tests for every screen before showing it:
1. **The squint test** — blur your eyes (or scale the screenshot to 25%). Can you still see the hierarchy: what's the title, what's the primary action, what's data? If everything is the same gray blob or everything screams, hierarchy failed.
2. **The bank test** — would a UAE bank ship this screen? If it looks like a hobby dashboard (rainbow charts, emoji, big shadows, gradient cards), no.
3. **The empty test** — open the screen with zero data. Is it still designed? Empty states are part of the product, not an afterthought.

---

## 1. Process: teardown first, then rebuild in slices

### 1.1 Audit before touching code
Before the first commit, produce `UI_AUDIT.md`:
- Screenshot every existing screen (light + dark).
- List every hardcoded hex, every inconsistent spacing value, every component that has no hover/focus/disabled state, every place money is not mono/right-aligned.
- List every "state gap": screens with no empty state, no loading state, no error state.
This audit becomes the punch list. Nothing on it may survive to the final build.

### 1.2 Build order (one slice at a time)
1. Tokens + fonts + dark mode switch (globals.css, tailwind config) — verify with a bare test page showing all tokens.
2. Primitives: Button, Input, Select, Switch, Segmented, Badge, Card — build a `/dev/kitchen-sink` route showing every variant in every state, light and dark. This route is the contract; screenshot it.
3. Shell: sidebar + topbar + page container.
4. One full screen end-to-end (Invoice list) to prove the system, including empty/loading/error.
5. Remaining screens in order: Dashboard → Create/Edit invoice → Invoice drawer → Customers → Ledger → Settings → Auth.
6. Print stylesheet.
7. Polish pass (§5) + QA pass (§6).

### 1.3 Self-critique loop — mandatory
After every slice: run the app, screenshot light + dark, and critique your own screenshot against DESIGN_SYSTEM and this file BEFORE presenting. Fix what you find, then present with the screenshots and one line: what you decided and why. Never declare a slice done from code alone — only from a running screenshot.

### 1.4 Small commits, honest status
- One slice = one commit, imperative message ("Rebuild invoice table to design system").
- Never say "done" if the app hasn't booted. Never silently skip a spec item — flag it.

---

## 2. Craft rules (this is where premium lives)

### 2.1 Spacing & alignment
- Everything sits on the 4/8 scale. If you type `margin: 13px`, stop.
- One left edge per region. Labels, values, titles in a card all share ONE alignment line. Misaligned left edges are the #1 amateur tell.
- Vertical rhythm inside cards: title → 4px → description → 16px → content. Between page sections: 32px. Be boringly consistent.
- Give data room. Premium finance UIs are ~40% whitespace. When unsure, add space, don't add borders.

### 2.2 Hierarchy through weight and tone, not size and color
- Differentiate with `--text` vs `--text-secondary` vs `--text-tertiary` and weight 400 vs 550 — not with more font sizes and never with random colors.
- Max ~4 font sizes visible per screen.
- Bold is loud: weight 600 is reserved for titles and totals. If half the screen is 600, nothing is important.

### 2.3 Numbers (the soul of this app)
- ALL money: JetBrains Mono, tabular, right-aligned in columns, 2 decimals always ("AED 1,250.00", never "1250" or "1,250.0").
- Currency prefix in `--text-tertiary`, amount in `--text` — the amount is the information.
- Negative/credit amounts: parentheses "(AED 500.00)" not minus signs, in `--text-secondary` — never red (red = overdue only).
- Invoice numbers mono everywhere: table, drawer, print, email, toast.
- Dates in tables: `07 Jul 2026` (mono, unambiguous, sorts visually). Relative time ("2 hours ago") only in activity feeds, with the absolute date in a tooltip.

### 2.4 Every interactive element has 5 designed states
Default, hover, focus-visible, active/pressed, disabled. Build them into the primitive once (§1.2 step 2) so every consumer inherits them. A button with no visible focus ring fails the a11y floor AND looks cheap to anyone who tabs.

### 2.5 Perceived performance = premium feel
- Optimistic UI for cheap mutations: recording a payment updates the row instantly, reconciles on server response, rolls back with a toast on failure.
- Never blank screens: static `--neutral-soft` placeholder blocks (no shimmer) for anything over ~150ms.
- Buttons show inline spinners and disable during submit — double-submit on "Issue invoice" is a financial bug, not just a UX bug.
- Preserve scroll position and filter state when returning to the invoice list from a drawer.

### 2.6 Forms that respect the user
- Autofocus the first field of every create flow. Enter submits single-field forms.
- Validate on blur, re-validate on change after first error — never on every keystroke from the start.
- Never clear a form on failure. Never make the user re-enter anything the system already knows.
- Line-item editor: Tab flows left-to-right through qty → description → govt fee → service fee → next row; last cell + Tab creates a new row. This one detail will make daily users love the app.
- Destructive/irreversible actions (Issue invoice): the confirm step states the consequence plainly — "This invoice becomes permanent and cannot be edited." No "Are you sure?".

### 2.7 Tables that feel expensive
- Column widths set deliberately: number (fixed, mono), customer (flex, truncate with tooltip), dates (fixed), money (fixed, right), status (fixed), actions (fixed, hover-reveal).
- Truncate text with ellipsis + title tooltip; never wrap rows to double height.
- Sortable headers show direction on the active column only. Sorting/filtering never causes layout jump.
- Sticky header on scroll. Row click opens the drawer; the whole row is the target, not a tiny "view" link.

### 2.8 Dark mode is a first-class citizen
- Build every slice in both modes simultaneously — dark is not a Friday-afternoon inversion.
- Check: charts, badges, borders, and shadows all remapped; nothing pure black/white; screenshots of BOTH modes in every self-critique.

---

## 3. Anti-patterns — instant "cheap AI dashboard" tells. Never do these.

- Gradient backgrounds, gradient text, gradient buttons.
- Colored glow shadows, giant drop shadows on cards.
- Emoji in the UI. Icons do that job, sparingly.
- More than one accent color per screen (semantic status tints excepted).
- Rainbow chart palettes; pie/donut charts (use bars — better for finance anyway).
- Cards inside cards inside cards. If a card contains one card, dissolve one layer.
- Uppercase bold headers everywhere (uppercase is caption-size labels ONLY).
- "Welcome back, User! 👋" hero banners. Open with the data.
- Centered page titles. Titles are left-aligned.
- Icon buttons without tooltips.
- Skeleton shimmer waves, spinner-only full pages, progress bars that lie.
- Animations over 400ms, bounce/elastic easings, things that slide in from off-screen sideways.
- Placeholder copy ("Lorem", "Manage your stuff efficiently"). Every string is real, in the product's voice (DESIGN_SYSTEM §7).
- Marketing adjectives in UI copy ("powerful", "seamless", "smart").

---

## 4. Screen-by-screen quality bar

**Dashboard** — Opens with the serif display figure that matters most: outstanding receivables. Below: 3–4 stat tiles (collected this month, overdue total, invoices issued, avg. days-to-pay) with NumberFlow and quiet trend indicators. One chart (monthly collected vs issued, 2 series max). One "Needs attention" list: overdue invoices, danger-tinted, each row actionable (Send reminder). No decorative widgets. Everything on this screen answers "how is the business right now?"

**Invoice list** — The workhorse. Segmented filter (All/Draft/Issued/Paid/Overdue) + search + date range in one toolbar row. Table per §2.7. Primary pill "Create invoice" top-right — the only blue button on the screen. Empty state per status ("No overdue invoices — nice." for overdue tab is acceptable warmth).

**Create/Edit invoice** — A focused document-shaped form, max-width ~760px, not a full-width field dump. Customer picker with inline "create new" that doesn't leave the flow. Line items per §2.6. Live totals panel (subtotal / VAT 5% on service fees / total) in mono, recalculating with NumberFlow. Two exits: "Save draft" (secondary) and "Issue invoice" (primary → confirm step). Autosave drafts every 20s silently; show "Saved · 14:32" in `--text-tertiary`.

**Invoice drawer** — Reads like the printed document: serif header, mono numbers, hairline tables. Payment history as a quiet timeline. Actions ordered by lifecycle: Draft → [Edit, Issue]; Issued → [Record payment, Send reminder, Print/PDF]; Paid → [Print] + "Paid · sealed" lock. Nothing on a paid invoice suggests editability.

**Customer ledger** — Statement layout: running balance column (mono), debits/credits per §2.3, opening balance row pinned. Virtualize past 100 rows. Export = print stylesheet of this view.

**Settings** — Copy the Claude settings pattern exactly: caption group label → rows of [label + gray description | right-aligned control] → hairline between rows. Toggles per DESIGN_SYSTEM §5.3. Business profile, VAT/TRN, invoice numbering (read-only display — numbering is system-owned), users, appearance (theme + motion segmented controls).

**Auth** — One centered `--surface` card on `--bg`, business name in serif, email + password + TOTP step. No illustration, no split-screen marketing panel. Quiet confidence.

**Print** — Test with real long data: 15+ line items paginates correctly, header repeats, totals never orphan onto a lonely last page.

---

## 5. The polish pass (do this as its own slice, near the end)

Walk the entire app and fix in one dedicated pass:
- Tab through every screen — logical focus order, visible rings, drawer traps focus, Esc closes topmost layer only.
- Hover every element — anything interactive responds within 150ms; anything non-interactive doesn't pretend.
- ⌘K palette reaches every entity and main action.
- Every toast names what happened ("Invoice INV-0042 issued") and, where useful, offers the follow-up ("View").
- Titles: browser tab shows "Invoices · [Business name]" per route.
- Text selection color = `--accent-soft`. Scrollbars styled thin and warm-toned. Favicon in place. `theme-color` meta matches `--bg` per mode.
- Zoom to 90% and 110% — nothing breaks. Resize to 1280, 1024, 768, 390 — sidebar collapses gracefully, tables scroll horizontally with sticky first column on mobile, drawer becomes Vaul sheet.

---

## 6. Definition of Done — per screen (all boxes, no exceptions)

- [ ] Matches DESIGN_SYSTEM tokens — zero hardcoded colors/sizes
- [ ] Light AND dark screenshots reviewed via self-critique (§1.3)
- [ ] Empty, loading, and error states designed and reachable
- [ ] All interactive elements: 5 states (§2.4)
- [ ] Keyboard-only walkthrough passes
- [ ] Money/dates formatted per §2.3 everywhere on the screen
- [ ] Copy in product voice, sentence case, no filler
- [ ] Responsive at 390 / 768 / 1024 / 1440
- [ ] No console errors/warnings
- [ ] Route first-load JS within budget (LIBRARIES_GUIDE §0.3)
- [ ] Anti-pattern scan (§3) clean

Final acceptance for the whole redesign: the kitchen-sink route, screenshots of every screen in both modes, Lighthouse a11y ≥ 95 and performance ≥ 90 on Dashboard and Invoice list, and a working print preview — presented together in one summary.

---

*Premium is a hundred small decisions made deliberately. Make them, show them, and never ship a screen you haven't looked at.*
