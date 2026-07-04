-- Task 1.2b — enforcement triggers per SCHEMA_DESIGN §4.1 + §4.2.
-- (§4.3 child-write parent-lock already landed in migration 0005 / task 1.2a.)
--
-- §4.1: the immutability COLUMN-TRANSITION MATRIX. The trigger validates the
-- SHAPE of the change, never the caller — Postgres triggers cannot see which
-- function is executing (S-5.2b). Comparison is jsonb-based: every column NOT
-- whitelisted for the transition must be byte-identical between OLD and NEW,
-- so any column added to invoices later is frozen by default until the matrix
-- is deliberately widened.

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
                       'notes','terms'];
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
CREATE TRIGGER invoices_transition_matrix
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_transition();
--> statement-breakpoint

-- §4.1 delete guard: only drafts may die. This is what makes the child ON
-- DELETE CASCADEs safe — RLS cannot stop a cascade or service_role (S-5.3).
CREATE OR REPLACE FUNCTION public.enforce_invoice_draft_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'invoices: % invoice % cannot be deleted — only drafts may be deleted',
      OLD.status, OLD.id;
  END IF;
  RETURN OLD;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER invoices_draft_only_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_draft_delete();
--> statement-breakpoint

-- §4.2 append-only on payments AND invoice_events — the three-layer recipe:
--   1) REVOKE UPDATE/DELETE from the app roles;
--   2) RLS enabled with NO UPDATE/DELETE policy for any role (admin included,
--      D-15 — SELECT/INSERT policies land with the full matrix in task 1.3);
--   3) an unconditional BEFORE UPDATE OR DELETE raise — the only layer that
--      also binds service_role and the Supabase dashboard.
-- Residual risk (superuser DISABLE TRIGGER) is accepted at this tier and
-- documented in the runbook — do not paper over it here.
CREATE OR REPLACE FUNCTION public.enforce_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION '%: append-only — % is never permitted (corrections are new rows: reversal payments / new events)',
    TG_TABLE_NAME, TG_OP;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER payments_append_only
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();
--> statement-breakpoint
CREATE TRIGGER invoice_events_append_only
  BEFORE UPDATE OR DELETE ON public.invoice_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON public.payments, public.invoice_events FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
