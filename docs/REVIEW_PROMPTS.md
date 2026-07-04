# REVIEW_PROMPTS.md — Planning Review Prompts

Two prompts. Run Prompt 1 in Claude Code (Fable, Plan Mode). Then give Prompt 2 to ChatGPT Codex along with the same documents. Finally, feed Codex's findings back into a short Claude Code session (or claude.ai) to adjudicate disagreements.

---

## PROMPT 1 — Claude Code (Fable 5, Plan Mode)

Copy everything between the lines:

---

You are reviewing the complete planning package for a production invoice system before any code is written. This is a paid client project for a UAE government services / typing centre; correctness of the financial logic is legally significant (UAE FTA compliance). Your job in this session is to find problems, not to write code.

Read, in this order, fully:
1. CLAUDE.md
2. PROJECT_PLAN.md
3. DECISIONS.md
4. SCHEMA_DESIGN.md
5. BUILD_PHASES.md
6. /reference/invoice_system_v2.html (approved UI prototype — its calculation logic was verified against a real client invoice)

Then produce a single document, REVIEW_REPORT.md, with these sections:

### 1. Contradictions
Every place where two documents disagree (or a document disagrees with the prototype's behavior). Quote both sides, state which should win and why. Do not silently resolve anything.

### 2. Schema critique
Attack SCHEMA_DESIGN.md as if you were the engineer who will be paged when it fails:
- Race conditions: is the issue_invoice() design actually gapless and duplicate-proof under concurrent issue from 4–6 users? Walk through the locking order. Consider: two staff issuing simultaneously, an issue racing a settings VAT-toggle change, an issue racing a draft edit.
- Immutability: can any path (RLS gap, function, cascade, Supabase dashboard role) mutate an issued invoice's financial content? List every write path to invoices, invoice_lines, invoice_extra_charges and prove each is safe or flag it.
- Append-only: verify the enforcement plan for invoice_events and payments is real (privileges AND trigger), not aspirational.
- Money: check every place amounts flow (form → draft → issue recompute → payments sum → derived status → CSV export → print) for unit consistency (fils integers end-to-end) and rounding rules. Where exactly is VAT rounded, per line or per invoice? UAE FTA has a rule — state it and pick a compliant approach.
- Derived payment_status: resolve SCHEMA_DESIGN.md §6 item 1 with a concrete decision and justification.
- Missing tables/columns: anything the BUILD_PHASES features need that the schema lacks (e.g., does global search need anything, does the event payload cover reprint auditing, is there a place for invoice notes/terms?).

### 3. Compliance check
FTA requirements for tax invoices in the UAE: mandatory fields on an issued tax invoice (TRN, sequential number, date, supplier details, VAT breakdown), 5-year retention, behavior when the client deregisters from VAT (what must invoices look like then — "tax invoice" wording must change). Verify the schema + settings design can satisfy each; flag gaps. Note: do NOT trust your memory for current FTA specifics — mark any requirement you are not certain of as VERIFY, so a human can confirm against official sources.

### 4. Build-plan critique
- Dependency order errors in BUILD_PHASES.md, tasks too large for one session, missing tasks (e.g., backup/restore drill? staging environment? uptime monitoring?).
- Anything in MVP that should be cut, anything cut that will embarrass the demo milestone.

### 5. Resolutions
Resolve all four open items in SCHEMA_DESIGN.md §6 with concrete recommendations.

### 6. Risk register
Top 10 ways this project fails technically, each with the cheapest mitigation.

Rules for this session:
- Plan Mode only. Do not create or modify any file except REVIEW_REPORT.md.
- Do not assume answers to any Q-item in DECISIONS.md; if a finding depends on one, say so.
- Locked decisions (D-items) may be challenged, but label such challenges clearly as "challenges a locked decision" — they need Mushtaq's explicit approval, not yours.
- Be specific: file, section, quoted text. No generic advice. If something is fine, say so in one line and move on — spend your effort where the risk is.

---

## PROMPT 2 — ChatGPT Codex (independent cross-check)

Attach/paste the same six documents PLUS Claude's REVIEW_REPORT.md. Copy everything between the lines:

---

You are the second, independent reviewer of a planning package for a single-tenant invoice system (Next.js 15 + Supabase/Postgres + Drizzle, ~10 users, ~300 invoices/month, UAE VAT context). Another AI (Claude) already produced REVIEW_REPORT.md. Your job is adversarial cross-checking: catch what it missed and challenge what it got wrong. Do not defer to it.

Deliver CODEX_REVIEW.md with exactly these sections:

### 1. Verdicts on Claude's findings
Go through REVIEW_REPORT.md finding by finding. For each: AGREE / DISAGREE / PARTIAL, with one-paragraph reasoning. Prioritize the disagreements — they are the valuable output.

### 2. What Claude missed
Independent findings not in REVIEW_REPORT.md. Focus areas where a second model adds most value:
- The issue_invoice() transaction: simulate failure at every step (crash after counter increment but before commit? Supabase connection pool + advisory behavior? function timeout mid-transaction?). Is the "ON CONFLICT DO UPDATE RETURNING" counter pattern actually gapless under Postgres READ COMMITTED, or does it need SERIALIZABLE / explicit advisory lock? Be precise about Postgres semantics.
- Supabase-specific traps: RLS with security-definer functions (search_path pinning?), auth.uid() inside triggers, Realtime + RLS interaction, PostgREST exposure of tables the app never intended to expose, service-role key handling in Next.js server actions.
- Next.js 15 App Router specifics: server actions and CSRF posture, caching pitfalls with financial data (stale invoice lists), where the confirm-and-issue flow could double-submit and whether idempotency is needed.
- Numbers: JavaScript bigint/number boundary — where fils amounts cross JSON serialization, TanStack Table, CSV export, and print rendering. Identify every place precision can silently break.
- Print CSS as the only PDF path: what breaks (page margins across browsers, thermal vs A4, fonts not loading at print time) and whether the plan needs a fallback.

### 3. Security review
Threat-model the design: staff-role privilege escalation paths, TOTP enrollment bypass, session revocation actually killing Supabase JWTs (or do tokens live until expiry?), the walk-in customer flow as an injection surface, CSV export data leakage.

### 4. Top 5 changes
If you could force only five changes to this plan before code is written, what are they? Ranked, with cost estimate (hours) for each.

Rules:
- Quote the specific document and line you're addressing.
- Mark any claim about UAE FTA regulations or Supabase current behavior that you cannot verify as VERIFY rather than stating it as fact.
- No praise, no summaries of what the documents say — findings only.

---

## After both reviews

Bring REVIEW_REPORT.md + CODEX_REVIEW.md back to claude.ai (or a short Claude Code session). The adjudication prompt is one line:

"Here are two independent reviews of the planning package. List every point where they disagree or where one found something the other missed, give your ruling on each with reasoning, and produce the final list of document changes for me to approve."

Only after that approved change list is applied to SCHEMA_DESIGN.md / BUILD_PHASES.md / DECISIONS.md does Phase 0 begin.
