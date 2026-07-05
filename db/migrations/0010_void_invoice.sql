-- Custom migration (task 4.4): void_invoice() — the only path from issued
-- to voided, mirroring issue_invoice()'s conventions (SECURITY DEFINER,
-- pinned search_path, active-user guard, event in the same transaction).
-- RLS matrix §5: neither staff nor admin holds raw UPDATE on issued rows —
-- void flows through this function, and the function itself enforces the
-- ADMIN-ONLY rule (CLAUDE.md §4: staff cannot void) so a direct PostgREST
-- RPC call cannot bypass the API layer.
--
-- The voided invoice keeps its number and every financial column frozen —
-- the §4.1 matrix permits ONLY status/voided_by/voided_at/void_reason (and
-- replaces_invoice_id) to change on issued → voided. Corrections are a NEW
-- document: the replacement draft is created app-side as ordinary draft
-- inserts carrying replaces_invoice_id (set at INSERT, matrix untouched).

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid, p_reason text)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_actor   uuid;
BEGIN
  v_actor := auth.uid();

  -- R-9.3: JWT callers must map to an ACTIVE profile…
  PERFORM assert_active_app_user();
  -- …and voiding is admin-only even over direct PostgREST (owner/service
  -- connections have auth.uid() IS NULL and pass, same as issue_invoice).
  IF v_actor IS NOT NULL AND app_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'void_invoice: only admins may void invoices';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'void_invoice: a void reason is required';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found', p_invoice_id;
  END IF;
  IF v_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'void_invoice: invoice % is a draft — edit it instead of voiding', p_invoice_id;
  END IF;
  IF v_invoice.status = 'voided' THEN
    RAISE EXCEPTION 'void_invoice: invoice % is already voided', p_invoice_id;
  END IF;

  UPDATE invoices
     SET status      = 'voided',
         voided_by   = v_actor,
         voided_at   = now(),
         void_reason = btrim(p_reason)
   WHERE id = p_invoice_id
   RETURNING * INTO v_invoice;

  INSERT INTO invoice_events (invoice_id, event_type, actor_id, payload)
  VALUES (p_invoice_id, 'voided', v_actor, jsonb_build_object('reason', btrim(p_reason)));

  RETURN v_invoice;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.void_invoice(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;
