# Prestige Land Invoice System — User Manual & Guide

A single-business, cloud invoice and customer-ledger system for **Prestige Land
Typing Center**, built for UAE VAT (FTA) compliance. This guide covers the
terminology, how the system works, and step-by-step instructions for both
**Admin** and **Staff** users. It is written to be handed to a new user for
training.

Live app: **https://inovice-system.vercel.app**

---

## 1. The system in brief

**What it is.** It replaces spreadsheets and manual invoices for ~10 users. It
creates VAT-compliant invoices, tracks who has paid, and keeps a permanent,
audit-safe record of everything.

**The core idea (why it is trustworthy).** Every invoice follows a one-way
path:

> **Draft → Issued (sealed) → (optionally) Voided**

Once an invoice is *issued*, its money can **never** be changed. Corrections
happen only by creating a new document. Every action — created, issued, paid,
voided, printed — is written to a permanent history that cannot be edited or
deleted. This is what makes the system safe for tax and audit.

**Money.** Every amount is stored to the fils (the AED cent) as a whole number,
never a rounded decimal, so totals and VAT always add up exactly. Foreign
currency, if used, is only a *display* layer — the invoice is always priced and
paid in AED.

**Two roles, enforced everywhere.** Staff and Admin have different powers (see
below). The limits are enforced by the server and the database, not just by
hiding buttons — a staff member cannot void an invoice or change settings even
by trying to work around the screen.

---

## 2. Terminology — what every word means

| Term | Meaning |
|---|---|
| **Draft** | An invoice being written. Fully editable. Has **no invoice number yet** and is invisible to search and reports. Nothing is official until it is issued. |
| **Issue / Issued** | The moment a draft is finalized. The system locks the numbers, assigns the **next invoice number** (INV-1, INV-2…), stamps the VAT rate, and records the date. This is the official act. |
| **Sealed** | A synonym for "issued and locked." A **sealed invoice can never be edited or deleted** — by anyone, ever (enforced at the database level). An invoice is sealed whether it is paid or not. |
| **Void** | The **only** way to cancel a sealed invoice. It is not deleted — it is marked *voided* with a reason (it stays on record), and you may create a replacement invoice. **Only an Admin can void.** |
| **Unpaid / Partially paid / Paid** | The payment status, calculated automatically from the payments recorded against the invoice. "Partially paid" = some money received, a balance remains. Independent of "sealed." |
| **Overpaid** | More money recorded than the invoice total (shown with a ⚑ flag). Not an error, just flagged. |
| **Overdue** | An **unpaid** invoice whose due date has passed (default 7 days after issue). Shown in **burnt orange** — the only thing in the app that uses that color, so orange always means "money is late." |
| **"Who owes us" / Outstanding** | The large blue figure on the dashboard: the **total unpaid balance across all customers** — how much money is owed to the business right now. |
| **Government Fee** | A pass-through fee collected on the customer's behalf (e.g. a ministry charge). **0% VAT** — not the company's revenue. |
| **Service / Typing Fee** | The company's actual charge for the work. **5% VAT applies** (when VAT-registered). This is revenue. |
| **TRN** | Tax Registration Number (UAE VAT ID). Printed on tax invoices when VAT-registered. |
| **Replacement / credit note** | Corrections never edit a sealed invoice — you void it and issue a **new** document that references the old one. The two are linked on screen. |
| **2FA / TOTP / Recovery codes** | Admins log in with a **6-digit code** from an authenticator app (Google Authenticator, etc.). Recovery codes are one-time backups if the phone is lost. |

---

## 3. User Manual — ADMIN

Admins can do everything Staff can (Section 4), plus the following.

**Logging in.** Email + password, then a **6-digit code** from your authenticator
app. Your first-ever login walks you through setting up 2FA — **save the
recovery codes** somewhere safe.

**Dashboard.** Your money at a glance: Outstanding ("who owes us"), invoiced this
month, VAT this month, a cash-flow chart, recent activity, and top customers.
The banner at the top flags unpaid invoices and open drafts.

**Settings** (`Settings` in the sidebar):
- **Company details** (top of the page): name, tagline, and address in
  **English (left) and Arabic (right)** — these print on the invoice header in
  the matching language. Below them, the **shared** fields: TRN, contact
  "stations" (each station = one phone + its email, printed in order), and bank
  details. Leaving an Arabic field blank falls back to the English value.
- **VAT:** toggle registered / unregistered and the rate. *This affects future
  invoices only* — already-issued invoices keep the rate sealed into them.
- **Invoices:** number format (must contain `{NN}`), paper size (A4 / A5),
  default due days, default notes and terms.
- **Payment methods:** cash / bank / card, etc. — add and reorder.

**Users** (`Users`): create Staff or Admin accounts (there is no self-signup).
Set a temporary password and hand it over in person; the user changes it, and if
they are an Admin they set up 2FA, on first login. You can also deactivate
accounts.

**Voiding an invoice:** open the sealed invoice → **Void** → give a reason →
optionally create a replacement draft. The original stays visible, marked
voided, linked to its replacement.

**Exports** (`Exports`): download CSVs of invoices, payments, or VAT for your
accountant. Drafts are excluded; figures are exact.

---

## 4. User Manual — STAFF

**Logging in.** Email + password (no 2FA code needed for staff).

**Create a customer.** `Customers` → *Add client* (regular, with full details) or
a walk-in (minimal). Search finds anyone instantly.

**Create an invoice.** `New invoice` in the sidebar:
1. **Pick the customer** (required first).
2. **Add line items** — description, quantity, **Government Fee** (0% VAT) and
   **Service Fee** (5% VAT) per line. Press **Tab** past the last cell to add a
   new row. Use *Get from recent* to reuse common line items.
3. Optionally set currency, notes, and terms.
4. **Save draft** to finish later (drafts autosave silently and appear under
   "Open drafts"), **or**
5. **Issue** — this opens a **preview**. Check it, then **Confirm & Issue**. The
   invoice is now sealed and gets its number. You can record a payment and print
   in the same step.

> ⚠️ Once you issue, the invoice is **sealed — it cannot be edited.** Get it
> right in the preview. If something is wrong after issuing, an **Admin** must
> void it.

**Record a payment.** Open the sealed invoice → payments panel → enter the amount
(full or partial), method, and date → record. The status updates automatically.
A recorded payment can be **reversed** (this adds a correcting entry — nothing is
deleted).

**Print / PDF.** Open the invoice → **Print** (or Ctrl+P). Toggle
**English / Arabic** on the document. Use your browser's "Save as PDF" for a
regular client; print on paper for walk-ins.
- *If the printed page shows the website address at the bottom:* that is a
  browser setting — in the print dialog open **More settings** and untick
  **"Headers and footers."** (The app also suppresses it automatically in
  Chrome / Edge.)

**Customer ledger.** Click any customer to see all their invoices, payments, and
running balance.

**Search.** Press **Ctrl + K** anywhere to jump to any customer, invoice, or
service.

---

## 5. Quick reference

- **Sidebar → Dashboard** — money overview.
- **Sidebar → New invoice** — create an invoice.
- **Sidebar → Invoices** — find, filter, open, print.
- **Sidebar → Customers** — clients and their ledgers.
- **Ctrl + K** — search anything.
- **Orange** — always means overdue / money is late.
- **Sealed** — issued and permanent; only an Admin can void.
