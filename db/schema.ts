// Drizzle schema — implements SCHEMA_DESIGN.md v2 (post-adjudication), all 12 tables.
//
// Conventions (SCHEMA_DESIGN header):
// - ALL money: fils (AED × 100) as bigint, mode "number" — never floats, never numeric.
//   JS numbers are safe: fils totals sit far below 2^53 (SCHEMA_DESIGN §7).
// - Every per-line fee column stores the UNIT fee; line component total = qty × unit_fee.
// - uuid PKs, created_at everywhere; deleted_at = soft delete on business entities.
// - Enforcement triggers, issue_invoice(), and RLS are tasks 1.2a/1.2b/1.3 — NOT here.
//   The pg_trgm extension, expression indexes, and the profiles→auth.users FK live in
//   the hand-written companion migration (drizzle-kit can't express them).

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  date,
  timestamp,
  jsonb,
  index,
  unique,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const fils = (name: string) => bigint(name, { mode: "number" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ── 2.2 profiles — extends Supabase auth.users (FK added in companion SQL) ── */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(), // = auth.users.id
    fullName: text("full_name").notNull(),
    role: text("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("profiles_role_check", sql`${t.role} in ('admin','staff')`)]
);

/* ── 2.1 settings — single row, company config ────────────────────────────── */
export const settings = pgTable("settings", {
  id: id(),
  companyName: text("company_name").notNull(),
  companyNameAr: text("company_name_ar"), // pending Q-08
  tagline: text("tagline"),
  trn: text("trn"), // kept populated during deregistration; just not printed (F-4b)
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  logoPath: text("logo_path"),
  bankDetails: text("bank_details"),
  vatRegistered: boolean("vat_registered").notNull().default(true), // D-16
  vatRateBp: integer("vat_rate_bp").notNull().default(500), // basis points
  invoiceNumberFormat: text("invoice_number_format").notNull().default("INV-{NN}"), // D-12
  paperSize: text("paper_size").notNull().default("A4"), // pending Q-07
  invoiceNotesDefault: text("invoice_notes_default"),
  invoiceTermsDefault: text("invoice_terms_default"),
  dueDaysDefault: integer("due_days_default"), // overdue convention until Q-11
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => profiles.id),
  createdAt: createdAt(),
});

/* ── 2.3 customers ─────────────────────────────────────────────────────────── */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    type: text("type").notNull(), // D-17; walk-ins always get a row (#7)
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    trn: text("trn"),
    address: text("address"), // finalize per Q-05
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("customers_type_check", sql`${t.type} in ('regular','walk_in')`),
    index("customers_type_idx").on(t.type),
    // trigram index on name → companion SQL migration
  ]
);

/* ── 2.4 services — catalogue, unit fees in fils [#1] ─────────────────────── */
export const services = pgTable("services", {
  id: id(),
  name: text("name").notNull(),
  govtFee: fils("govt_fee").notNull().default(0), // unit, 0% VAT passthrough
  serviceFee: fils("service_fee").notNull().default(0), // unit, VATable revenue
  unit: text("unit").notNull().default("unit"),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ── 2.5 payment_methods — lookup, admin-editable (R-2/D-25) [#6] ─────────── */
export const paymentMethods = pgTable("payment_methods", {
  id: id(),
  label: text("label").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

/* ── 2.6 invoices ──────────────────────────────────────────────────────────── */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    // Display text only — NOT unique; real uniqueness is (number_year, number_seq) [#4]
    invoiceNumber: text("invoice_number"),
    numberYear: integer("number_year"),
    numberSeq: integer("number_seq"),
    status: text("status").notNull().default("draft"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id), // NOT NULL [#7]
    customerSnapshot: jsonb("customer_snapshot"), // frozen at issue
    issueDate: date("issue_date"),
    supplyDate: date("supply_date"), // VERIFY V-1 (FTA date of supply)
    dueDate: date("due_date"), // conventions pending Q-11
    vatRegisteredSnapshot: boolean("vat_registered_snapshot"), // D-16
    vatRateBpSnapshot: integer("vat_rate_bp_snapshot"),
    // Server-computed totals, fils — written only by issue_invoice()
    subtotalGovt: fils("subtotal_govt"),
    subtotalService: fils("subtotal_service"),
    subtotalExtras: fils("subtotal_extras"),
    vatAmount: fils("vat_amount"),
    grandTotal: fils("grand_total"),
    notes: text("notes"), // editable while draft, frozen after [#11]
    terms: text("terms"),
    replacesInvoiceId: uuid("replaces_invoice_id").references((): AnyPgColumn => invoices.id), // links replacement to the voided original [#11]
    createdBy: uuid("created_by").references(() => profiles.id),
    issuedBy: uuid("issued_by").references(() => profiles.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => profiles.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("invoices_status_check", sql`${t.status} in ('draft','issued','voided')`),
    unique("invoices_number_year_seq_unique").on(t.numberYear, t.numberSeq),
    index("invoices_status_idx").on(t.status),
    index("invoices_customer_id_idx").on(t.customerId),
    index("invoices_issue_date_idx").on(t.issueDate),
    // GIN trigram on (customer_snapshot->>'name') → companion SQL migration
  ]
);

/* ── 2.7 invoice_lines — qty × unit fees [#2], frozen per-line VAT [#5] ───── */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    qty: integer("qty").notNull().default(1),
    govtFee: fils("govt_fee").notNull().default(0), // UNIT fee
    serviceFee: fils("service_fee").notNull().default(0), // UNIT fee
    vatAmount: fils("vat_amount").notNull().default(0), // frozen at issue (§3.1)
    createdAt: createdAt(),
  },
  (t) => [
    check("invoice_lines_qty_check", sql`${t.qty} > 0`),
    index("invoice_lines_invoice_id_idx").on(t.invoiceId),
  ]
);

/* ── 2.8 invoice_extra_columns — per-invoice dynamic fee columns (D-24) [#3] ─ */
export const invoiceExtraColumns = pgTable(
  "invoice_extra_columns",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    vatable: boolean("vatable").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("invoice_extra_columns_invoice_id_idx").on(t.invoiceId)]
);

/* ── 2.9 invoice_line_fees — junction: line × extra column (D-24) [#3] ────── */
export const invoiceLineFees = pgTable(
  "invoice_line_fees",
  {
    id: id(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => invoiceLines.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => invoiceExtraColumns.id, { onDelete: "cascade" }),
    amount: fils("amount").notNull().default(0), // UNIT amount; total = line.qty × amount
    vatAmount: fils("vat_amount").notNull().default(0), // frozen at issue when vatable
    createdAt: createdAt(),
  },
  (t) => [unique("invoice_line_fees_line_column_unique").on(t.lineId, t.columnId)]
);

/* ── 2.10 payments — insert-only ledger (D-14); triggers in 1.2b ──────────── */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: fils("amount").notNull(), // negative = reversal row
    methodId: uuid("method_id")
      .notNull()
      .references(() => paymentMethods.id), // R-2 [#6]
    reversesPaymentId: uuid("reverses_payment_id").references((): AnyPgColumn => payments.id), // pairs a reversal with its original [#6]
    reference: text("reference"),
    receivedOn: date("received_on").notNull(),
    recordedBy: uuid("recorded_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("payments_amount_nonzero_check", sql`${t.amount} <> 0`),
    index("payments_invoice_id_idx").on(t.invoiceId), // derived-status join depends on this
  ]
);

/* ── 2.11 invoice_events — append-only audit trail (D-15); triggers in 1.2b ─ */
export const invoiceEvents = pgTable(
  "invoice_events",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    // 'printed' = print REQUESTED — best-effort by design (SCHEMA_DESIGN §2.11)
    eventType: text("event_type").notNull(),
    actorId: uuid("actor_id").references(() => profiles.id),
    payload: jsonb("payload").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "invoice_events_type_check",
      sql`${t.eventType} in ('created','draft_updated','issued','payment_recorded','payment_reversed','voided','printed','emailed')`
    ),
    index("invoice_events_invoice_id_idx").on(t.invoiceId),
  ]
);

/* ── mfa_recovery_codes — task 2.1 [#24]. Supabase has no native TOTP
      recovery codes, so we store SHA-256 hashes of one-time codes generated at
      enrollment. Consuming one (RUNBOOK-admin-mfa-recovery) unenrolls the TOTP
      factor via the admin API so the admin can re-enroll. Owner-scoped RLS in
      the companion SQL of the same migration. ─────────────────────────────── */
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: id(),
    userId: uuid("user_id").notNull(), // FK to auth.users in companion SQL
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("mfa_recovery_codes_user_id_idx").on(t.userId)]
);

/* ── 2.12 invoice_counters — gapless numbering state; issue_invoice() only ── */
export const invoiceCounters = pgTable("invoice_counters", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});
