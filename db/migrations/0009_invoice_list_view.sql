-- Custom migration (task 4.3): the invoice_list read view — derived payment
-- status computed at read time, never stored (SCHEMA_DESIGN §6 verbatim).
--
-- security_invoker = true is LOAD-BEARING: without it the view runs with
-- the owner's privileges and would bypass the invoices/payments RLS
-- policies for every caller. With it, the querying role's own RLS applies
-- (matrix §5: staff and admin SELECT; anon nothing).
--
-- payment_status semantics:
--   draft/voided → NULL; issued → unpaid / partial / paid from SUM(payments).
--   Overpayment still reads 'paid' — the UI flags it; not an error state.
--   'overdue' is a pure display predicate downstream, never stored here.

CREATE VIEW public.invoice_list
WITH (security_invoker = true) AS
SELECT i.*,
       COALESCE(p.paid, 0) AS paid_total,
       CASE
         WHEN i.status <> 'issued' THEN NULL
         WHEN COALESCE(p.paid, 0) = 0 THEN 'unpaid'
         WHEN COALESCE(p.paid, 0) >= i.grand_total THEN 'paid'
         ELSE 'partial'
       END AS payment_status
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM public.payments WHERE invoice_id = i.id
) p ON true;
--> statement-breakpoint
-- The underlying tables' RLS is the enforcement (security_invoker); the
-- view itself just needs to be selectable by app roles.
GRANT SELECT ON public.invoice_list TO authenticated;
