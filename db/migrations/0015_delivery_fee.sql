ALTER TABLE "invoices" ADD COLUMN "delivery_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_delivery_fee_non_negative" CHECK ("invoices"."delivery_fee" >= 0);--> statement-breakpoint

-- Third-party delivery collected on the customer's behalf (D-30).
--
-- The centre sometimes arranges a driver for the customer and collects the
-- driver's fee with the bill. That money is NOT the centre's supply, so it is
-- stored BESIDE grand_total, never inside it:
--
--   grand_total                    = the centre's supply  → what the FTA copy
--                                    prints, what the VAT export reports
--   grand_total + delivery_fee     = what the customer actually owes → the
--                                    customer copy, payments, ledger, "who
--                                    owes us"
--
-- Keeping it out of grand_total is what lets the FTA copy print a figure that
-- is byte-identical to the sealed record while never mentioning delivery.

-- Widen the immutability transition matrix (§4.1, migrations 0006/0011) so
-- delivery_fee is editable WHILE DRAFT. It is frozen after issue for free: no
-- other transition lists it, so draft→issued and issued→voided still require
-- it byte-identical, and issue_invoice() never touches it.
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
                       'notes','terms','display_currency','exchange_rate_e6',
                       'delivery_fee'];
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
--> statement-breakpoint

-- invoice_list gains customer_total, and payment_status now settles against
-- what the CUSTOMER owes rather than the centre's supply — otherwise every
-- delivery invoice would read 'overpaid' the moment it is paid in full.
-- For delivery_fee = 0 (every pre-D-30 invoice) this is byte-identical to 0013.
--
-- DROP + CREATE, NOT create-or-replace: the view freezes its column list via
-- `i.*`, and ALTER TABLE ADD COLUMN has since moved that list on (0011, and
-- delivery_fee above). create-or-replace may only APPEND view columns, never
-- reorder, so re-expanding i.* is rejected by Postgres (the 0013 lesson).
-- invoice_list has no dependents, so DROP is safe; security_invoker and the
-- GRANT are re-declared because DROP discards them.
DROP VIEW IF EXISTS public.invoice_list;
--> statement-breakpoint
CREATE VIEW public.invoice_list
WITH (security_invoker = true) AS
SELECT i.*,
       COALESCE(p.paid, 0) AS paid_total,
       CASE
         WHEN i.grand_total IS NULL THEN NULL
         ELSE i.grand_total + i.delivery_fee
       END AS customer_total,
       CASE
         WHEN i.status <> 'issued' THEN NULL
         WHEN COALESCE(p.paid, 0) >= i.grand_total + i.delivery_fee THEN 'paid'
         WHEN COALESCE(p.paid, 0) = 0 THEN 'unpaid'
         ELSE 'partial'
       END AS payment_status
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM public.payments WHERE invoice_id = i.id
) p ON true;
--> statement-breakpoint
GRANT SELECT ON public.invoice_list TO authenticated;