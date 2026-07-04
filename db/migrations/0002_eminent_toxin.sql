CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"trn" text,
	"address" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_type_check" CHECK ("customers"."type" in ('regular','walk_in'))
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_events_type_check" CHECK ("invoice_events"."event_type" in ('created','draft_updated','issued','payment_recorded','payment_reversed','voided','printed','emailed'))
);
--> statement-breakpoint
CREATE TABLE "invoice_extra_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"label" text NOT NULL,
	"vatable" boolean NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_fees_line_column_unique" UNIQUE("line_id","column_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"govt_fee" bigint DEFAULT 0 NOT NULL,
	"service_fee" bigint DEFAULT 0 NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_qty_check" CHECK ("invoice_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text,
	"number_year" integer,
	"number_seq" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_snapshot" jsonb,
	"issue_date" date,
	"supply_date" date,
	"due_date" date,
	"vat_registered_snapshot" boolean,
	"vat_rate_bp_snapshot" integer,
	"subtotal_govt" bigint,
	"subtotal_service" bigint,
	"subtotal_extras" bigint,
	"vat_amount" bigint,
	"grand_total" bigint,
	"notes" text,
	"terms" text,
	"replaces_invoice_id" uuid,
	"created_by" uuid,
	"issued_by" uuid,
	"issued_at" timestamp with time zone,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_year_seq_unique" UNIQUE("number_year","number_seq"),
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('draft','issued','voided'))
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method_id" uuid NOT NULL,
	"reverses_payment_id" uuid,
	"reference" text,
	"received_on" date NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonzero_check" CHECK ("payments"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_role_check" CHECK ("profiles"."role" in ('admin','staff'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"govt_fee" bigint DEFAULT 0 NOT NULL,
	"service_fee" bigint DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"company_name_ar" text,
	"tagline" text,
	"trn" text,
	"address" text,
	"phone" text,
	"email" text,
	"logo_path" text,
	"bank_details" text,
	"vat_registered" boolean DEFAULT true NOT NULL,
	"vat_rate_bp" integer DEFAULT 500 NOT NULL,
	"invoice_number_format" text DEFAULT 'INV-{NN}' NOT NULL,
	"paper_size" text DEFAULT 'A4' NOT NULL,
	"invoice_notes_default" text,
	"invoice_terms_default" text,
	"due_days_default" integer,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_events" ADD CONSTRAINT "invoice_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_extra_columns" ADD CONSTRAINT "invoice_extra_columns_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_fees" ADD CONSTRAINT "invoice_line_fees_line_id_invoice_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_fees" ADD CONSTRAINT "invoice_line_fees_column_id_invoice_extra_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."invoice_extra_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_invoice_id_invoices_id_fk" FOREIGN KEY ("replaces_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_profiles_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_id_payment_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reverses_payment_id_payments_id_fk" FOREIGN KEY ("reverses_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_type_idx" ON "customers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "invoice_events_invoice_id_idx" ON "invoice_events" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_extra_columns_invoice_id_idx" ON "invoice_extra_columns" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");