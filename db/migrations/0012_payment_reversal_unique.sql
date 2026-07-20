-- Payments defense-in-depth (production-reliability batch).
--
-- The rest of the system follows CLAUDE.md §3.1 rigorously: a trigger is the
-- MANDATORY backstop, with RLS and the app layer as ADDITIONAL layers, never
-- alternatives. Payments were the exception — the invariants "you may only pay
-- an ISSUED invoice" and "a reversal must negate exactly one original, once"
-- were enforced ONLY in the API route (app/api/invoices/[id]/payments). An
-- authenticated caller hitting PostgREST directly, or service_role / the
-- dashboard, could insert a payment against a draft/voided invoice, an
-- arbitrary unpaired negative row, or a second reversal of the same payment.
--
-- This migration adds the missing DB-level guards. It changes NO sealed-invoice
-- math and touches no existing rows. (The CREATE UNIQUE INDEX below is the
-- drizzle-generated diff for the new schema.ts index; the trigger above is the
-- hand-written companion — drizzle-kit cannot express triggers.)

CREATE OR REPLACE FUNCTION public.enforce_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status text;
  v_orig   public.payments;
BEGIN
  SELECT status INTO v_status FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'payments: invoice % does not exist', NEW.invoice_id;
  END IF;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'payments: invoice % is % — payments may only be recorded against an issued invoice',
      NEW.invoice_id, v_status;
  END IF;

  IF NEW.reverses_payment_id IS NULL THEN
    -- A recorded payment must be positive (zero is already barred by the
    -- payments_amount_nonzero_check constraint).
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'payments: a recorded payment must be positive — negative rows must reference the payment they reverse';
    END IF;
  ELSE
    SELECT * INTO v_orig
      FROM public.payments
     WHERE id = NEW.reverses_payment_id
     FOR UPDATE;
    IF v_orig.id IS NULL THEN
      RAISE EXCEPTION 'payments: reversal target % does not exist', NEW.reverses_payment_id;
    END IF;
    IF v_orig.invoice_id <> NEW.invoice_id THEN
      RAISE EXCEPTION 'payments: a reversal must belong to the same invoice as its original';
    END IF;
    IF v_orig.amount <= 0 OR v_orig.reverses_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'payments: only an original positive payment may be reversed';
    END IF;
    IF NEW.amount <> -v_orig.amount THEN
      RAISE EXCEPTION 'payments: a reversal must negate its original exactly';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER payments_insert_guard
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_insert();
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_reversal_per_original" ON "payments" USING btree ("reverses_payment_id") WHERE "payments"."reverses_payment_id" IS NOT NULL;
