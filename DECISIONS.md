# DECISIONS.md — Locked Decisions & Open Questions

**Purpose:** The single registry of (a) decisions that are final and must not be revisited without explicit instruction from Mushtaq, and (b) questions still awaiting the client. Build tasks blocked by open questions are marked in BUILD_PHASES.md.

---

## A. Locked decisions

### Commercial
- **D-01** Pricing: AED 5,000–7,500 one-time build + AED 200/month operations (Supabase ~$25/mo + support). Relationship rate — final for this engagement.
- **D-02** Payment split: 30% upfront / 40% on working demo / 30% on delivery. First 3 months hosting paid upfront at go-live.
- **D-03** Timeline: 6 working weeks. (Client requested 2-week compression — not accepted as committed schedule.)
- **D-04** Infrastructure ownership: client owns the domain; Mushtaq operates Vercel + Supabase under Zeerak Hostix accounts, with explicit handover terms in the project agreement.

### Stack
- **D-05** Next.js 15 App Router, TypeScript strict, single Vercel deployment. No separate API server, no Fastify, no Redis, no BullMQ.
- **D-06** Supabase: Postgres + Auth (TOTP MFA for admin) + Realtime + Storage. **Pro tier from day one.** *(Reworded per ADJUDICATION #19 / REVIEW_REPORT F-3: Pro daily backups are disaster recovery, retained on the order of days — they are NOT the FTA 5-year retention mechanism. Retention = the live database + a **monthly `pg_dump` exported to client-owned storage** + a periodic restore drill, per BUILD_PHASES Phase 7.)*
- **D-07** Drizzle ORM, append-only SQL migrations.
- **D-08** Tailwind + shadcn/ui, react-hook-form + zod, Zustand, TanStack Table. Resend for email, Sentry for errors.
- **D-09** **No server-side PDF generation.** Browser print CSS only. Walk-ins get paper; regular clients print-to-PDF. No PDF libraries.

### Invoice domain
- **D-10** Two-column fee structure per line: Government Fee (0% VAT, passthrough, not revenue) + Service/Typing Fee (5% VAT, revenue).
- **D-11** Dynamic per-invoice extra columns, each with its own VAT-ability toggle.
- **D-12** Numbering: `INV-NN`, sequential, resets each January, format Settings-configurable. Allocated by an atomic gapless Postgres function inside the issue transaction. Client's stated preference — do not override with INV-YYYY-NNNN.
- **D-13** Issued invoices are **immutable**. Corrections via credit note / replacement invoice only. Enforced at UI, application, and database layers.
- **D-14** Payments in a `payments` table (row per payment). Status (`unpaid`/`partial`/`paid`) derived, never stored as mutable truth. Partial payment is a first-class state.
- **D-15** `invoice_events` append-only event log for every state change. No UPDATE/DELETE, enforced at DB level.
- **D-16** VAT rate and registration state snapshotted at issue time. Settings VAT toggle affects future invoices only (client has applied for VAT deregistration — system must work in both modes without code changes).
- **D-17** Customers: `regular` vs `walk-in` distinction. Walk-ins may have minimal data.

### Scope (MVP includes)
- **D-18** CSV export, session revocation (admin), and global search are MVP scope.
- **D-19** Roles: Admin (owner, full access, TOTP required) and Staff (create/view invoices, record payments; no user management, no Settings, no void/credit, no delete). Server-side enforcement.

### Post-adjudication decisions (2026-07-04, per ADJUDICATION.md)
- **D-24** Extra charges are modeled as per-invoice dynamic **columns** with a per-line junction: `invoice_extra_columns` (label, vatable, position) + `invoice_line_fees` (line_id, column_id, unit amount, frozen VAT). JSONB storage rejected (ADJUDICATION R-1: typed bigint, NOT NULL, and FK integrity are real constraints on money; junction is the natural home for frozen per-charge VAT).
- **D-25** Payment methods live in a `payment_methods` lookup table (admin-editable rows, FK from `payments.method_id`) — DB-enforced integrity **and** runtime configurability, no CHECK constraint hardcoding open Q-10, no migration per change (ADJUDICATION R-2).
- **D-26** Conditional-reopen rule for D-09 (no server-side PDF): **if Q-07's answer is a thermal printer, D-09 must be formally reopened with Mushtaq** — thermal receipts are genuinely incompatible with A4 print CSS (ADJUDICATION R-8). *Status: recorded as the adjudicated rule; flagged for Mushtaq's explicit confirmation — see VERIFY register V-7.*

### Foreign currency (2026-07-12, owner decision)
- **D-27** Multi-currency invoices use an **AED-anchored display layer**, not true multi-currency. Prices are still entered and **sealed in AED fils** (the FTA record of truth, `issue_invoice()` math unchanged). Each invoice carries a `display_currency` (default `AED`) and a snapshotted `exchange_rate_e6` (AED per 1 foreign unit × 1e6, frozen at issue); the printed/previewed document **renders foreign = AED ÷ rate with the AED equivalent shown** (FTA requires the tax amount + total in AED). No foreign amount is ever stored — always derived, so it cannot drift. **Records, VAT, payments, CSV/VAT exports, dashboard, and customer ledger stay AED** (they aggregate across invoices or are the tax record). Rate is entered manually (owner uses the supply-date rate); a foreign invoice cannot be issued without a positive rate. Supersedes the deferred "currency toggle = display-symbol-only" note (2026-07-09) — the owner chose real rate + conversion, but AED-anchored per the invariant. Rejected alternative: foreign-entry (type USD, convert to AED) — it would make the sealed AED a rounded derivative of entry, rewrite `issue_invoice()`, and is out of MVP scope (chargeable).

### Localization — bilingual print (2026-07-13, owner decision)
- **D-28** The printed invoice is **bilingual (English + Arabic)** — client-confirmed batch 4 (Q-08). Layout = **mirrored / RTL block** (owner chose this over side-by-side per-field labels, 2026-07-13). The printed document renders the **English invoice**, a `· النسخة العربية · ARABIC COPY ·` divider, then a **full Arabic mirror** of the same document: `dir="rtl"`, translated FIXED labels only, self-hosted **IBM Plex Sans Arabic** (`--font-arabic` via next/font/google — Inter/JBM/Source Serif carry no Arabic glyphs). One shared render is parameterised by a label-dictionary + direction, so figures, dates, customer name, and line descriptions are **byte-identical across both languages**; **money and dates stay in Latin numerals in both copies** (UAE FTA convention, keeps the copies tied). Only fixed labels are translated — user-entered values (customer name, line descriptions, custom column labels) are NOT. `settings.company_name_ar` drives the Arabic company name (falls back to the Latin name). `break-inside-avoid` keeps each language on its own page (English p1, Arabic p2 on A4; A5 same layout at zoom 0.72). Directional spacing/alignment uses logical utilities (`text-start/-end`, `pe-*`) so the same markup mirrors correctly under rtl. **Shipped PR #67, deployed to prod 2026-07-13.** Open: owner still owes a manual browser print-to-PDF sign-off (fonts/printer); the *app-UI* language (vs invoice-only Arabic) remains unpinned.

### Design — "Stamped Paper"
- **D-20** Light `#f6f5f2` / dark `#0a0d12`. Single accent FTA federal blue (`#003b5c` / `#5b95c4`) for action signals only. Burnt orange `#c2410c` for overdue only. No gradients.
- **D-21** Inter Tight for UI; JetBrains Mono for all numerics. **No serif fonts.**
- **D-22** Editorial details: Roman numeral row indices, hairline borders, "Paid · sealed" indicators, stamp-style document reference top-right.
- **D-23** Invoice preview: slide-over drawer (~45–50% width, shadcn Sheet), NOT a permanent split view. Issue flow always shows mandatory preview + "Confirm & Issue" before sealing. *(Decided 2026-07-04, supersedes the v2 prototype's side-by-side preview.)*

---

## B. Open questions — awaiting client (17-question brief sent on WhatsApp)

> The authoritative brief text is on WhatsApp. When the client replies, record each answer here with a date, then unblock the corresponding tasks in BUILD_PHASES.md. Until answered, anything below must be built as configurable or deferred — never assumed.

- **Q-01** Business type confirmation: is the two-column govt-fee + service-fee model correct for his business (Prestige Land–style typing centre), or single-fee? → blocks final invoice form & print layout.
  **✅ ANSWERED 2026-07-05 (via Mushtaq): two columns CONFIRMED.** The client's own sample invoice (`invoice.jpg.jpeg`, relayed by Mushtaq) shows exactly the Unit Price (govt/passthrough) + Service Fee shape. Phase 4 form is valid as built.
- **Q-02** Exact company details for the invoice header: legal name, TRN, address, logo file, contact lines. → blocks print CSS finalization.
  **◐ PARTIALLY ANSWERED 2026-07-05 — from the client's sample invoice (details only; layout/design NOT to be copied):**
  - Contacts: `+971 50 986 0956` / `+971 50 714 2037`; emails `pristigeland@gmail.com` / `Prestigelandtyping@gmail.com`
  - Address: `Bawabat Al Sharq St., Civic Center Al Jimi, Al Ain, United Arab Emirates`
  - Sample numbering style observed: `INV-1001` (our format is Settings-configurable, D-12 — admin can match it)
  - **STILL OPEN:** exact legal name (emails imply "Prestige Land Typing" — confirm spelling), TRN (none on the sample — ties into Q-03), and the **logo file**: the sample's purple logo reads "James Sharp Photography" — clearly the invoice TEMPLATE's placeholder, not the business logo. Do NOT copy it. Need the real logo as a file before 6.1.
- **Q-03** VAT deregistration status/date — launch in registered or deregistered mode? → blocks Settings defaults (not schema).
  **✅ ANSWERED 2026-07-05 (client, 2nd batch): registered WITH a TRN, but deregistration applied and initially approved; per the authority's guidance they do NOT issue tax (TRN-based) invoices during the process.** → Launch in **deregistered mode**: `vat_registered=false` (0% VAT, no TRN printed — F-4b keeps the TRN stored once provided). The exact TRN value itself was still not supplied; not blocking since it isn't printed.
- **Q-04** Which extra charge types recur (courier, stamp, photocopy…) and their default VAT-ability. → blocks extra-columns presets (feature itself is locked, D-11).
  **✅ ANSWERED 2026-07-05 (client: "null"): no recurring extra charges** — no presets needed; the manual add-column path already built is the final shape.
- **Q-05** Customer fields required for regulars (TRN? address? credit terms?). → blocks customer form finalization.
  **✅ ANSWERED 2026-07-05: some clients are served on CREDIT.** The existing nullable field set suffices; credit is expressed through the due-date convention (Q-11: one week) and the outstanding-balance ledger/report — no schema change.
- **Q-06** Employee list and who gets accounts at launch; who besides the owner is "admin," if anyone. → blocks user seeding only.
  **✅ ANSWERED 2026-07-05: many employees on duty schedules; the owner needs the facility to create user+password per availability** — exactly what /admin/users (task 2.2) already provides. No names given; accounts get created at handover.
- **Q-07** Receipt/print paper size in the shop (A4 vs A5 vs thermal). → blocks print CSS.
  **✅ ANSWERED 2026-07-05 (via Mushtaq): A4 AND A5 — NOT thermal.** D-26's conditional reopen of D-09 is NOT triggered (V-7 closes). Settings paper-size unlocks to A4|A5; task 6.1 print CSS must render honestly on both.
- **Q-08** Language: English-only, or Arabic on the printed invoice? → potentially large; if Arabic required, print layout needs RTL treatment — flag to Mushtaq immediately on answer.
  **⚠️ ANSWERED 2026-07-05: BOTH English AND Arabic — FLAGGED TO MUSHTAQ same day per the rule.** Scope impact lands on task 6.1 only (schema already Unicode; `company_name_ar` exists): bilingual labels on the print template, RTL text runs, and a self-hosted Arabic typeface (Inter Tight/JetBrains Mono carry no Arabic glyphs — add e.g. IBM Plex Sans Arabic/Noto Sans Arabic via next/font). Mushtaq must confirm this scope (and any price implication with the client) BEFORE 6.1 is built.
  **✅ CONFIRMED 2026-07-09 (client, batch 4): the invoice PRINTED COPY must carry BOTH languages** (the 2026-07-05 answer clarified — bilingual applies to the printed document; app-UI language is separate and still unpinned). **Layout decided + SHIPPED 2026-07-13 — see D-28.**
- **Q-09** Any existing customer/invoice data to import from Excel, and its shape. → blocks migration/import task.
  **◐ ANSWERED 2026-07-05: "will be provided"** — task 7.4 stays; waiting on the actual file to see its shape.
- **Q-10** Preferred payment methods to record (cash, card, bank transfer, cheque) and whether reference numbers are needed. → blocks payments form detail.
  **✅ ANSWERED 2026-07-05 (via Mushtaq): "cash, bank, card etc."** — matches the seeded `payment_methods` (Cash, Card, Bank transfer, Cheque); admin can add more anytime (D-25). Reference-number need unspecified — the optional `reference` field already covers it.
- **Q-11–Q-17** Remaining items from the WhatsApp brief (reporting expectations, email sending needs, invoice due-date conventions, discount handling, go-live date, training expectations, domain purchase). Reconcile this list against the actual brief text — the WhatsApp version is authoritative.
  **✅ ANSWERED 2026-07-05 (client, 2nd batch):**
  - **Due-date convention: ONE WEEK** → `settings.due_days_default = 7`; overdue rendering already keys off it.
  - **Discounts: none shown on invoices** → no discount feature; if a price concession happens they simply charge less on the line.
  - **Emailing: NOT needed — "printing is enough"** → per the BUILD_PHASES rule, **task 6.4 is DELETED and Resend drops out of the stack** (CLAUDE.md §2 email line becomes moot; no keys to wire).
  - **Reports: "who still owes our money"** → outstanding balances is THE headline report: 7.1 dashboard must lead with it; the customer ledger (5.2) and CSV exports (6.2) already carry it.
  - **Go-live: no deadline** ("not important").
  - **Domain: not required** → production stays on the vercel.app URL (D-04 revisited: no client domain purchase).
  - **Training: Mr Sahil** is the handover attendee (7.5 walkthrough).
  **STILL OPEN after both batches: the logo file and the exact legal name (Q-02 remainder) — the only true blockers left, both for 6.1.**
  **UPDATE 2026-07-05 (Mushtaq, 3rd instruction): legal/display name = "Prestige Land Typing Center"; invoices must show NO 5% VAT (deregistered launch mode already does this); and the printed invoice must use the CLIENT'S SAMPLE LAYOUT EXACTLY — this supersedes the earlier "details only, not layout" note. The invoice document component now replicates that layout (logo block placeholder until the real file arrives). Remaining open item: the logo file only.**

**Rule:** if the client's answers contradict a locked decision, stop and raise it with Mushtaq — do not silently change a D-item.

---

## C. VERIFY register — external confirmation required (ADJUDICATION #18)

> **Owner: the client's accountant (~1 hour), before Phase 6 print sign-off.** These are regulatory/vendor facts that must NOT be resolved from an AI's memory or by a coding session. Record the answer + source + date against each entry when confirmed. Findings referenced resolve in `docs/REVIEW_REPORT.md`.

- **V-1 (F-1)** The authoritative FTA mandatory-field list for a full tax invoice (supply date? per-line tax display? discount display?) — confirm against the current Executive Regulations / FTA guides.
- **V-2 (F-2)** Simplified tax invoice: exact eligibility conditions and threshold (commonly cited AED 10,000 / unregistered recipient) — determines which format walk-in invoices use.
- **V-3 (S-4)** Annual-reset numbering: are visually duplicate `INV-NN` numbers across years (distinguished only by date) acceptable to the FTA? **Also flagged for Mushtaq** — if the answer is no, D-12's no-year format must be revisited with the client.
- **V-4 (F-5)** The exact FTA VAT-rounding provision (nearest fils, line-item basis assumed in SCHEMA_DESIGN §3.1) — record the citation in SCHEMA_DESIGN once confirmed.
- **V-5 (F-3)** Current Supabase Pro backup-retention terms — confirms the D-06 reword and sizes the monthly-export duty.
- **V-6 (F-4a)** Post-deregistration correction path: how to correct/void-and-replace a VAT-era invoice after deregistration (replacement cannot charge VAT).
- **V-7 (R-8/D-26)** *Awaiting Mushtaq, not the accountant:* explicit confirmation of the D-09 conditional-reopen rule (thermal printer answer to Q-07 ⇒ the PDF discussion reopens). **✅ RESOLVED 2026-07-05: Q-07 answered A4+A5, not thermal — the reopen condition can never fire. D-09 stands as decided.**
