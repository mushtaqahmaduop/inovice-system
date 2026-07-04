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
- **D-06** Supabase: Postgres + Auth (TOTP MFA for admin) + Realtime + Storage. **Pro tier from day one** (daily backups for FTA 5-year retention).
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

### Design — "Stamped Paper"
- **D-20** Light `#f6f5f2` / dark `#0a0d12`. Single accent FTA federal blue (`#003b5c` / `#5b95c4`) for action signals only. Burnt orange `#c2410c` for overdue only. No gradients.
- **D-21** Inter Tight for UI; JetBrains Mono for all numerics. **No serif fonts.**
- **D-22** Editorial details: Roman numeral row indices, hairline borders, "Paid · sealed" indicators, stamp-style document reference top-right.
- **D-23** Invoice preview: slide-over drawer (~45–50% width, shadcn Sheet), NOT a permanent split view. Issue flow always shows mandatory preview + "Confirm & Issue" before sealing. *(Decided 2026-07-04, supersedes the v2 prototype's side-by-side preview.)*

---

## B. Open questions — awaiting client (17-question brief sent on WhatsApp)

> The authoritative brief text is on WhatsApp. When the client replies, record each answer here with a date, then unblock the corresponding tasks in BUILD_PHASES.md. Until answered, anything below must be built as configurable or deferred — never assumed.

- **Q-01** Business type confirmation: is the two-column govt-fee + service-fee model correct for his business (Prestige Land–style typing centre), or single-fee? → blocks final invoice form & print layout.
- **Q-02** Exact company details for the invoice header: legal name, TRN, address, logo file, contact lines. → blocks print CSS finalization.
- **Q-03** VAT deregistration status/date — launch in registered or deregistered mode? → blocks Settings defaults (not schema).
- **Q-04** Which extra charge types recur (courier, stamp, photocopy…) and their default VAT-ability. → blocks extra-columns presets (feature itself is locked, D-11).
- **Q-05** Customer fields required for regulars (TRN? address? credit terms?). → blocks customer form finalization.
- **Q-06** Employee list and who gets accounts at launch; who besides the owner is "admin," if anyone. → blocks user seeding only.
- **Q-07** Receipt/print paper size in the shop (A4 vs A5 vs thermal). → blocks print CSS.
- **Q-08** Language: English-only, or Arabic on the printed invoice? → potentially large; if Arabic required, print layout needs RTL treatment — flag to Mushtaq immediately on answer.
- **Q-09** Any existing customer/invoice data to import from Excel, and its shape. → blocks migration/import task.
- **Q-10** Preferred payment methods to record (cash, card, bank transfer, cheque) and whether reference numbers are needed. → blocks payments form detail.
- **Q-11–Q-17** Remaining items from the WhatsApp brief (reporting expectations, email sending needs, invoice due-date conventions, discount handling, go-live date, training expectations, domain purchase). Reconcile this list against the actual brief text — the WhatsApp version is authoritative.

**Rule:** if the client's answers contradict a locked decision, stop and raise it with Mushtaq — do not silently change a D-item.
