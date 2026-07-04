-- Task 1.2a — issue_invoice() + gapless numbering + child-write parent-lock.
-- Implements SCHEMA_DESIGN §3 (the sealing transaction, R-3/R-4) and §4.3
-- (child-write parent-lock trigger — pulled forward from 1.2b because §4.3
-- explicitly requires 1.2a's edit-vs-issue race test, which needs the trigger).
--
-- Design notes not obvious from the spec:
-- - Actor identity comes from auth.uid() ONLY (CLAUDE.md §4) — never a parameter.
--   NULL when called outside a Supabase session (e.g. SQL tests); issued_by is nullable.
-- - Counter year + default issue_date use TODAY in Asia/Dubai (the sealing moment).
--   A draft's pre-set issue_date is kept as display data but never picks the
--   counter year: numbering tracks the year the seal actually happens, so a
--   backdated draft can never reopen a closed year's sequence.
-- - Effective VAT rate is 0 when vat_registered = false (D-16 deregistered mode);
--   the snapshots still record the raw settings values.
-- - Rounding (§3.1): half-up to the nearest fils on non-negative integers is
--   (qty*unit_fee*rate_bp + 5000) / 10000 in bigint arithmetic. Negative unit
--   fees are rejected before computing — the formula (and the business) don't
--   define them.

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_invoice        public.invoices%ROWTYPE;
  v_settings       record;
  v_customer       record;
  v_rate           integer; -- effective VAT bp (0 when deregistered)
  v_subtotal_govt    bigint;
  v_subtotal_service bigint;
  v_subtotal_extras  bigint;
  v_vat_lines        bigint;
  v_vat_extras       bigint;
  v_today          date;
  v_year           integer;
  v_seq            integer;
  v_number         text;
  v_actor          uuid;
BEGIN
  v_actor := auth.uid();

  -- 1. Lock the invoice row FIRST (locking order: own invoice → shared counter;
  --    shared resource acquired last so the classic deadlock shape cannot form).
  --    Status re-checked AFTER lock acquisition: a racing second caller blocks
  --    here, re-reads 'issued', and aborts (S-2).
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_invoice: invoice % not found', p_invoice_id;
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_invoice: invoice % is not a draft (status=%)',
      p_invoice_id, v_invoice.status;
  END IF;
  IF v_invoice.customer_id IS NULL THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has no customer', p_invoice_id;
  END IF;
  PERFORM 1 FROM invoice_lines WHERE invoice_id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has no lines', p_invoice_id;
  END IF;

  -- Data-sanity guards: the §3.1 formula is defined on non-negative money only,
  -- and every fee must belong to this invoice through BOTH its line and column.
  PERFORM 1 FROM invoice_lines
   WHERE invoice_id = p_invoice_id AND (govt_fee < 0 OR service_fee < 0);
  IF FOUND THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has a negative unit fee', p_invoice_id;
  END IF;
  PERFORM 1
    FROM invoice_line_fees f
    JOIN invoice_lines l ON l.id = f.line_id
   WHERE l.invoice_id = p_invoice_id AND f.amount < 0;
  IF FOUND THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has a negative extra-fee amount', p_invoice_id;
  END IF;
  PERFORM 1
    FROM invoice_line_fees f
    JOIN invoice_lines l ON l.id = f.line_id
    JOIN invoice_extra_columns c ON c.id = f.column_id
   WHERE l.invoice_id = p_invoice_id AND c.invoice_id <> l.invoice_id;
  IF FOUND THEN
    RAISE EXCEPTION 'issue_invoice: invoice % has an extra fee whose column belongs to another invoice', p_invoice_id;
  END IF;

  -- 2. Settings snapshot in a SINGLE statement — one atomic read, no torn
  --    values against a concurrent Settings change.
  SELECT vat_registered, vat_rate_bp, invoice_number_format
    INTO v_settings
    FROM settings
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_invoice: settings row missing';
  END IF;
  v_rate := CASE WHEN v_settings.vat_registered THEN v_settings.vat_rate_bp ELSE 0 END;

  -- 3. Recompute everything server-side in fils, and write the frozen per-line
  --    VAT amounts NOW, while the parent is still 'draft' — the §4.3 parent-lock
  --    trigger rejects child writes under a non-draft parent, so this ordering
  --    is load-bearing.
  UPDATE invoice_lines
     SET vat_amount = (qty::bigint * service_fee * v_rate + 5000) / 10000
   WHERE invoice_id = p_invoice_id;

  UPDATE invoice_line_fees f
     SET vat_amount = CASE WHEN c.vatable
                           THEN (l.qty::bigint * f.amount * v_rate + 5000) / 10000
                           ELSE 0 END
    FROM invoice_lines l, invoice_extra_columns c
   WHERE f.line_id = l.id
     AND f.column_id = c.id
     AND l.invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(qty::bigint * govt_fee),    0),
         COALESCE(SUM(qty::bigint * service_fee), 0),
         COALESCE(SUM(vat_amount),                0)
    INTO v_subtotal_govt, v_subtotal_service, v_vat_lines
    FROM invoice_lines
   WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(l.qty::bigint * f.amount), 0),
         COALESCE(SUM(f.vat_amount),             0)
    INTO v_subtotal_extras, v_vat_extras
    FROM invoice_line_fees f
    JOIN invoice_lines l ON l.id = f.line_id
    JOIN invoice_extra_columns c ON c.id = f.column_id
   WHERE l.invoice_id = p_invoice_id;

  SELECT name, trn, address, phone
    INTO v_customer
    FROM customers
   WHERE id = v_invoice.customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_invoice: customer % not found', v_invoice.customer_id;
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Dubai')::date;
  v_year  := EXTRACT(year FROM v_today)::integer;

  -- 4. Counter allocation — deliberately LAST before the writes (R-3: shortest
  --    possible hold on the shared row lock). Seeded with 1 [#4]: the first
  --    invoice of a fresh year gets seq 1 (S-1 regression). The counter row is
  --    MVCC data, not a sequence — any failure below rolls this back with
  --    everything else: no gap, no orphaned number.
  INSERT INTO invoice_counters (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO v_seq;

  v_number := replace(v_settings.invoice_number_format, '{NN}', v_seq::text);

  -- 5. Seal. Column set matches the §4.1 draft→issued matrix exactly.
  UPDATE invoices
     SET status                  = 'issued',
         invoice_number          = v_number,
         number_year             = v_year,
         number_seq              = v_seq,
         customer_snapshot       = jsonb_build_object(
                                     'name',    v_customer.name,
                                     'trn',     v_customer.trn,
                                     'address', v_customer.address,
                                     'phone',   v_customer.phone),
         issue_date              = COALESCE(v_invoice.issue_date, v_today),
         vat_registered_snapshot = v_settings.vat_registered,
         vat_rate_bp_snapshot    = v_settings.vat_rate_bp,
         subtotal_govt           = v_subtotal_govt,
         subtotal_service        = v_subtotal_service,
         subtotal_extras         = v_subtotal_extras,
         vat_amount              = v_vat_lines + v_vat_extras,
         grand_total             = v_subtotal_govt + v_subtotal_service
                                   + v_subtotal_extras + v_vat_lines + v_vat_extras,
         issued_by               = v_actor,
         issued_at               = now()
   WHERE id = p_invoice_id;

  -- 6. Event row, same transaction.
  INSERT INTO invoice_events (invoice_id, event_type, actor_id, payload)
  VALUES (p_invoice_id, 'issued', v_actor,
          jsonb_build_object('invoice_number', v_number,
                             'number_year', v_year,
                             'number_seq', v_seq));

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  RETURN v_invoice;
END;
$fn$;
--> statement-breakpoint

-- §4.3 child-write parent-lock: BEFORE I/U/D on all three child tables.
-- FOR NO KEY UPDATE on the parent conflicts with issue_invoice()'s FOR UPDATE,
-- so a draft edit and an issue SERIALIZE — an edit can no longer slip between
-- the recompute and the commit (closes S-3). SECURITY DEFINER so the lock does
-- not depend on the caller's table privileges once RLS lands (1.3).
-- Beyond the spec's single-parent wording, an UPDATE that RE-PARENTS a row
-- checks BOTH the old and new parent — otherwise a row could be moved into or
-- out of an issued invoice.
CREATE OR REPLACE FUNCTION public.enforce_parent_invoice_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_parent_old uuid;
  v_parent_new uuid;
  v_parent     uuid;
  v_status     text;
BEGIN
  IF TG_TABLE_NAME = 'invoice_line_fees' THEN
    -- Resolve the parent via the line. A missing line means the line was
    -- already deleted in this transaction (cascade path) — resolves to NULL.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT invoice_id INTO v_parent_old FROM invoice_lines WHERE id = OLD.line_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT invoice_id INTO v_parent_new FROM invoice_lines WHERE id = NEW.line_id;
    END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_parent_old := OLD.invoice_id; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_parent_new := NEW.invoice_id; END IF;
  END IF;

  FOREACH v_parent IN ARRAY array_remove(
    ARRAY[v_parent_old,
          CASE WHEN v_parent_new IS DISTINCT FROM v_parent_old THEN v_parent_new END],
    NULL)
  LOOP
    SELECT status INTO v_status FROM invoices WHERE id = v_parent FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      -- Cascade path: the parent row was already deleted in this transaction,
      -- and §4.1's delete guard (task 1.2b) proves it was a draft.
      CONTINUE;
    END IF;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION '%: parent invoice % is % — children of a non-draft invoice are frozen',
        TG_TABLE_NAME, v_parent, v_status;
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_parent_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_invoice_draft();
--> statement-breakpoint
CREATE TRIGGER invoice_extra_columns_parent_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_extra_columns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_invoice_draft();
--> statement-breakpoint
CREATE TRIGGER invoice_line_fees_parent_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_fees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_invoice_draft();
--> statement-breakpoint

-- Privileges: the function is callable by signed-in app users only; the
-- counter table has NO app-role privileges at all (§5 — function-only access;
-- issue_invoice is SECURITY DEFINER so it reaches the counter regardless).
REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE public.invoice_counters FROM anon, authenticated;
