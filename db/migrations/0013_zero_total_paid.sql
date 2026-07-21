-- payment_status branch-order fix (reliability/polish batch 2).
--
-- The 0009 invoice_list view derived payment_status with the "paid = 0"
-- branch ABOVE the "paid >= grand_total" branch. For a zero-total issued
-- invoice (grand_total = 0, no payments) that ordering returned 'unpaid'
-- forever — nothing is owed, yet it reads as an open balance and pollutes
-- "who owes us" and the unpaid banner. Reordering so the settled branch
-- (paid >= grand_total, which 0 >= 0 satisfies) wins first fixes it and is
-- otherwise identical for every non-zero invoice:
--   paid = 0, total > 0  → unpaid      (paid < total, then paid = 0)
--   0 < paid < total     → partial
--   paid >= total (incl. total = 0) → paid / overpaid (UI flags overpay)
--
-- CREATE OR REPLACE keeps the view's grants and the security_invoker flag.
-- Append-only: this supersedes the CASE in 0009, it does not edit it.

CREATE OR REPLACE VIEW public.invoice_list
WITH (security_invoker = true) AS
SELECT i.*,
       COALESCE(p.paid, 0) AS paid_total,
       CASE
         WHEN i.status <> 'issued' THEN NULL
         WHEN COALESCE(p.paid, 0) >= i.grand_total THEN 'paid'
         WHEN COALESCE(p.paid, 0) = 0 THEN 'unpaid'
         ELSE 'partial'
       END AS payment_status
FROM public.invoices i
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS paid FROM public.payments WHERE invoice_id = i.id
) p ON true;
