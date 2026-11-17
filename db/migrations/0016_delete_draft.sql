CREATE TABLE "deleted_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"line_count" integer DEFAULT 0 NOT NULL,
	"draft_created_by" uuid,
	"draft_created_by_name" text,
	"draft_created_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_by_name" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_drafts" ADD CONSTRAINT "deleted_drafts_draft_created_by_profiles_id_fk" FOREIGN KEY ("draft_created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_drafts" ADD CONSTRAINT "deleted_drafts_deleted_by_profiles_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_drafts_deleted_at_idx" ON "deleted_drafts" USING btree ("deleted_at");--> statement-breakpoint

/* ═══════════════════════════════════════════════════════════════════════════
   D-31 — deleting a draft (owner request, 2026-07-27)
   ═══════════════════════════════════════════════════════════════════════════
   A draft carries no invoice number, no VAT, no customer copy and no payment:
   it is scratch, and §4.1 always intended it to be deletable (the RLS DELETE
   policy `invoices_delete_draft` and the `invoices_draft_only_delete` trigger
   both already permit it). The one thing standing in the way was §4.2's
   append-only guard on invoice_events: every draft owns a 'created' event and
   the FK is ON DELETE NO ACTION, so the delete always failed.

   This migration opens exactly one narrow door and no more:
     · invoice_events keeps its own guard function. DELETE is tolerated ONLY
       when the transaction-local flag `app.draft_purge` holds the very
       invoice id being purged AND that invoice is still a draft. UPDATE is
       still never permitted, and payments keep the untouched, unconditional
       enforce_append_only().
     · Only delete_draft() ever sets that flag, with is_local = true, so it
       cannot outlive the transaction. A JWT caller cannot exploit it anyway:
       authenticated holds no DELETE grant on invoice_events and RLS gives it
       no DELETE policy, so layers 1 and 2 still stop a direct PostgREST call
       whatever the flag says. Only this SECURITY DEFINER function gets past.
     · Erasing the draft leaves ONE tombstone in deleted_drafts — who deleted
       whose draft, when — so an admin retains oversight of employees.
   ═══════════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.enforce_invoice_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- The single sanctioned erasure: delete_draft() purging the events of the
  -- draft it is about to remove. Scoped to one invoice id, one transaction.
  IF TG_OP = 'DELETE'
     AND current_setting('app.draft_purge', true) = OLD.invoice_id::text
     AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = OLD.invoice_id AND i.status = 'draft')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '%: append-only — % is never permitted (corrections are new rows: reversal payments / new events)',
    TG_TABLE_NAME, TG_OP;
END;
$fn$;--> statement-breakpoint

DROP TRIGGER IF EXISTS invoice_events_append_only ON public.invoice_events;--> statement-breakpoint
CREATE TRIGGER invoice_events_append_only
  BEFORE UPDATE OR DELETE ON public.invoice_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_events_append_only();--> statement-breakpoint

/* ── deleted_drafts: append-only itself, admin+staff readable ─────────────── */
CREATE TRIGGER deleted_drafts_append_only
  BEFORE UPDATE OR DELETE ON public.deleted_drafts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();--> statement-breakpoint

ALTER TABLE public.deleted_drafts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public.deleted_drafts FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT ON public.deleted_drafts TO authenticated;--> statement-breakpoint
CREATE POLICY deleted_drafts_select ON public.deleted_drafts FOR SELECT
  USING (app_role() IN ('admin','staff'));--> statement-breakpoint

/* ── delete_draft() — the only path that erases a draft ───────────────────── */
CREATE OR REPLACE FUNCTION public.delete_draft(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_actor   uuid;
  v_lines   integer;
  v_name    text;
  v_author  text;
  v_deleter text;
BEGIN
  v_actor := auth.uid();

  -- R-9.3: a JWT caller must map to an ACTIVE profile.
  PERFORM assert_active_app_user();

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_draft: invoice % not found', p_invoice_id;
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'delete_draft: invoice % is % — only drafts may be deleted (void it instead)',
      p_invoice_id, v_invoice.status;
  END IF;

  -- The owner's rule: an admin, or the employee who created the draft. Enforced
  -- HERE, not just in the API, so a direct PostgREST RPC obeys it too. Owner /
  -- service connections have auth.uid() IS NULL and pass, as elsewhere.
  IF v_actor IS NOT NULL
     AND app_role() IS DISTINCT FROM 'admin'
     AND v_invoice.created_by IS DISTINCT FROM v_actor
  THEN
    RAISE EXCEPTION 'delete_draft: only an admin or the employee who created draft % may delete it',
      p_invoice_id;
  END IF;

  -- Defensive: a draft cannot be paid (payments hang off sealed invoices), and
  -- payments are append-only — so if one somehow exists, stop rather than fail
  -- halfway through on the FK.
  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'delete_draft: draft % has payments recorded against it', p_invoice_id;
  END IF;

  SELECT count(*) INTO v_lines FROM invoice_lines WHERE invoice_id = p_invoice_id;
  SELECT name INTO v_name FROM customers WHERE id = v_invoice.customer_id;
  SELECT full_name INTO v_author FROM profiles WHERE id = v_invoice.created_by;
  SELECT full_name INTO v_deleter FROM profiles WHERE id = v_actor;

  INSERT INTO deleted_drafts (
    invoice_id, customer_id, customer_name, line_count,
    draft_created_by, draft_created_by_name, draft_created_at,
    deleted_by, deleted_by_name
  ) VALUES (
    p_invoice_id, v_invoice.customer_id, v_name, v_lines,
    v_invoice.created_by, v_author, v_invoice.created_at,
    v_actor, COALESCE(v_deleter, 'system')
  );

  PERFORM set_config('app.draft_purge', p_invoice_id::text, true);
  DELETE FROM invoice_events WHERE invoice_id = p_invoice_id;
  DELETE FROM invoices WHERE id = p_invoice_id;  -- lines / extra columns cascade
  PERFORM set_config('app.draft_purge', '', true);

  RETURN p_invoice_id;
END;
$fn$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.delete_draft(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_draft(uuid) TO authenticated;