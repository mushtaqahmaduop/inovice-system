ALTER TABLE "invoices" ADD COLUMN "display_currency" text DEFAULT 'AED' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "exchange_rate_e6" bigint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_currency" text DEFAULT 'AED' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_exchange_rate_positive" CHECK ("invoices"."exchange_rate_e6" is null or "invoices"."exchange_rate_e6" > 0);--> statement-breakpoint

-- Foreign-currency display layer (AED-anchored). Widen the immutability
-- transition matrix (§4.1, migration 0006) so the two new columns are
-- editable WHILE DRAFT. They are frozen after issue automatically: no other
-- transition lists them, so draft→issued and issued→voided still require them
-- byte-identical (issue_invoice() never touches them). issue_invoice() is
-- deliberately NOT re-declared — the sealed AED math stays byte-identical.
CREATE OR REPLACE FUNCTION public.enforce_invoice_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_allowed text[];
  v_bad     text;
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    -- Draft edits; totals stay NULL until issue.
    v_allowed := ARRAY['customer_id','issue_date','supply_date','due_date',
                       'notes','terms','display_currency','exchange_rate_e6'];
  ELSIF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    IF OLD.invoice_number IS NOT NULL OR OLD.number_seq IS NOT NULL THEN
      RAISE EXCEPTION 'invoices: draft % already carries a number — refusing to issue',
        OLD.id;
    END IF;
    v_allowed := ARRAY['status','invoice_number','number_year','number_seq',
                       'customer_snapshot','issue_date','supply_date',
                       'vat_registered_snapshot','vat_rate_bp_snapshot',
                       'subtotal_govt','subtotal_service','subtotal_extras',
                       'vat_amount','grand_total','issued_by','issued_at'];
  ELSIF OLD.status = 'issued' AND NEW.status = 'voided' THEN
    -- Nothing financial.
    v_allowed := ARRAY['status','voided_by','voided_at','void_reason',
                       'replaces_invoice_id'];
  ELSE
    RAISE EXCEPTION 'invoices: transition ''%'' → ''%'' is not allowed (invoice %)',
      OLD.status, NEW.status, OLD.id;
  END IF;

  IF (to_jsonb(OLD) - v_allowed) IS DISTINCT FROM (to_jsonb(NEW) - v_allowed) THEN
    SELECT string_agg(key, ', ' ORDER BY key) INTO v_bad
      FROM (
        SELECT COALESCE(o.key, n.key) AS key
          FROM jsonb_each(to_jsonb(OLD) - v_allowed) o
          FULL JOIN jsonb_each(to_jsonb(NEW) - v_allowed) n USING (key)
         WHERE o.value IS DISTINCT FROM n.value
      ) changed;
    RAISE EXCEPTION 'invoices: column(s) [%] may not change on ''%'' → ''%'' (invoice %)',
      v_bad, OLD.status, NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$fn$;