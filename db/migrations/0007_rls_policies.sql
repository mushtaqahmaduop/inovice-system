-- Task 1.3 — RLS for every table per SCHEMA_DESIGN §5.
--
-- Principles encoded here:
-- - One helper, app_role(): SECURITY DEFINER (reads profiles without recursing
--   into profiles' own RLS), pinned search_path, and the is_active
--   CIRCUIT-BREAKER (R-9.3) — a deactivated user's still-live JWT resolves to
--   NULL role, so every policy fails, even via direct PostgREST where
--   middleware never runs. Identity only from auth.uid() (CLAUDE.md §4).
-- - Permissive policies are OR'd, so EVERY policy repeats its role check in
--   WITH CHECK too — otherwise an admin-scoped WITH CHECK (true) would accept
--   rows written by staff whose own WITH CHECK failed.
-- - anon gets NOTHING: beyond having no policies, all privileges on app tables
--   are revoked, so PostgREST answers "permission denied", not empty sets.
-- - invoice_counters: RLS on, zero policies, zero privileges — function-only
--   (issue_invoice is SECURITY DEFINER).
-- - Issue/void mutate invoices ONLY through SECURITY DEFINER functions: the
--   app-role UPDATE policy is draft→draft (WITH CHECK status='draft'), and
--   INSERT only admits drafts with no number — a forged pre-sealed row cannot
--   enter through PostgREST.
-- - Service-role usage policy (S-5.4): the service key is NEVER used for
--   ordinary reads/writes in server actions — user-scoped clients only; it is
--   reserved for rare, explicitly justified admin operations. (service_role
--   retains Supabase's default table grants and bypasses RLS; the 0005/0006
--   triggers are the layers that bind it.)

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_role() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;
--> statement-breakpoint

-- R-9.3 closure for the RPC path: RLS makes a deactivated user's JWT see
-- nothing through PostgREST tables, but issue_invoice() is SECURITY DEFINER —
-- without this guard a deactivated user could still seal drafts by calling
-- the function directly. When the caller IS a JWT user (auth.uid() not null),
-- require an active profile; owner/service paths (auth.uid() null) are
-- unaffected. Applied by re-declaring the function's actor block via a
-- guard-wrapper: the function body from 0005 is unchanged except this check.
CREATE OR REPLACE FUNCTION public.assert_active_app_user()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND app_role() IS NULL THEN
    RAISE EXCEPTION 'caller is not an active user';
  END IF;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.assert_active_app_user() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.assert_active_app_user() TO authenticated;
--> statement-breakpoint

-- Re-declaration of issue_invoice() — byte-identical to 0005 except the
-- PERFORM assert_active_app_user() guard after the actor assignment.
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
  -- R-9.3: a JWT caller must map to an ACTIVE profile; deactivated users are
  -- cut off from the RPC path too, not only from PostgREST tables (task 1.3).
  PERFORM assert_active_app_user();

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

-- Enable RLS everywhere (payments + invoice_events already enabled in 0006).
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoice_extra_columns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoice_line_fees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- anon: nothing, and visibly so.
REVOKE ALL ON public.settings, public.profiles, public.customers,
  public.services, public.payment_methods, public.invoices,
  public.invoice_lines, public.invoice_extra_columns, public.invoice_line_fees,
  public.payments, public.invoice_events, public.invoice_counters FROM anon;
--> statement-breakpoint

/* ── settings — staff read; admin update (via admin-guarded server action) ── */
CREATE POLICY settings_select ON public.settings FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY settings_update_admin ON public.settings FOR UPDATE
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint

/* ── profiles — read for display; admin manages ───────────────────────────── */
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY profiles_insert_admin ON public.profiles FOR INSERT
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint

/* ── customers — staff work non-deleted rows; only admin soft-deletes ─────── */
CREATE POLICY customers_select ON public.customers FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY customers_insert ON public.customers FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff') AND deleted_at IS NULL);
--> statement-breakpoint
CREATE POLICY customers_update_staff ON public.customers FOR UPDATE
  USING (app_role() = 'staff' AND deleted_at IS NULL)
  WITH CHECK (app_role() = 'staff' AND deleted_at IS NULL);
--> statement-breakpoint
CREATE POLICY customers_update_admin ON public.customers FOR UPDATE
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint

/* ── services — staff read, admin manage (soft delete incl.) ──────────────── */
CREATE POLICY services_select ON public.services FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY services_insert_admin ON public.services FOR INSERT
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint
CREATE POLICY services_update_admin ON public.services FOR UPDATE
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint

/* ── payment_methods — staff read, admin manage ───────────────────────────── */
CREATE POLICY payment_methods_select ON public.payment_methods FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY payment_methods_insert_admin ON public.payment_methods FOR INSERT
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint
CREATE POLICY payment_methods_update_admin ON public.payment_methods FOR UPDATE
  USING (app_role() = 'admin')
  WITH CHECK (app_role() = 'admin');
--> statement-breakpoint

/* ── invoices — both roles; raw writes are DRAFT-ONLY, sealing is issue_invoice() ── */
CREATE POLICY invoices_select ON public.invoices FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoices_insert_draft ON public.invoices FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff')
              AND status = 'draft'
              AND invoice_number IS NULL
              AND number_year IS NULL
              AND number_seq IS NULL
              AND issued_at IS NULL);
--> statement-breakpoint
CREATE POLICY invoices_update_draft ON public.invoices FOR UPDATE
  USING (app_role() IN ('admin','staff') AND status = 'draft')
  WITH CHECK (app_role() IN ('admin','staff') AND status = 'draft');
--> statement-breakpoint
CREATE POLICY invoices_delete_draft ON public.invoices FOR DELETE
  USING (app_role() IN ('admin','staff') AND status = 'draft');
--> statement-breakpoint

/* ── invoice children — writable only while the parent is a draft (§4.3 trigger backstops) ── */
CREATE POLICY invoice_lines_select ON public.invoice_lines FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoice_lines_insert ON public.invoice_lines FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_lines_update ON public.invoice_lines FOR UPDATE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'))
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_lines_delete ON public.invoice_lines FOR DELETE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint

CREATE POLICY invoice_extra_columns_select ON public.invoice_extra_columns FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoice_extra_columns_insert ON public.invoice_extra_columns FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_extra_columns_update ON public.invoice_extra_columns FOR UPDATE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'))
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_extra_columns_delete ON public.invoice_extra_columns FOR DELETE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.status = 'draft'));
--> statement-breakpoint

CREATE POLICY invoice_line_fees_select ON public.invoice_line_fees FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoice_line_fees_insert ON public.invoice_line_fees FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
     WHERE l.id = line_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_line_fees_update ON public.invoice_line_fees FOR UPDATE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
     WHERE l.id = line_id AND i.status = 'draft'))
  WITH CHECK (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
     WHERE l.id = line_id AND i.status = 'draft'));
--> statement-breakpoint
CREATE POLICY invoice_line_fees_delete ON public.invoice_line_fees FOR DELETE
  USING (app_role() IN ('admin','staff') AND EXISTS (
    SELECT 1 FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
     WHERE l.id = line_id AND i.status = 'draft'));
--> statement-breakpoint

/* ── payments / invoice_events — SELECT + INSERT only; no U/D policy for ANY
      role, admin included (D-15). Layers 1+3 live in 0006. ─────────────────── */
CREATE POLICY payments_select ON public.payments FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY payments_insert ON public.payments FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoice_events_select ON public.invoice_events FOR SELECT
  USING (app_role() IN ('admin','staff'));
--> statement-breakpoint
CREATE POLICY invoice_events_insert ON public.invoice_events FOR INSERT
  WITH CHECK (app_role() IN ('admin','staff'));
