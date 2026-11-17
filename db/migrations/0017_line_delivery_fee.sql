ALTER TABLE "invoice_lines" ADD COLUMN "delivery_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_delivery_fee_non_negative" CHECK ("invoice_lines"."delivery_fee" >= 0);--> statement-breakpoint

-- Delivery moves from ONE field on the invoice to a COLUMN in the line grid
-- (client request 2026-07-30: "delivery charges should be beside the service
-- fee in the rows and columns"). D-30 is unchanged in substance — only where
-- the operator types the number changes:
--
--   invoice_lines.delivery_fee  = the driver's fee attributed to that row
--   invoices.delivery_fee       = SUM of the column, still sitting BESIDE
--                                 grand_total, never inside it
--
-- Everything downstream of invoices.delivery_fee is therefore untouched:
-- issue_invoice() still never sees delivery (grand_total stays the centre's
-- supply, byte-identical), invoice_list.customer_total / payment_status still
-- settle against grand_total + delivery_fee, the FTA copy still prints the
-- supply alone, and the customer copy still blends the fee into its line
-- amounts. No view is re-created and no function is re-declared here.
--
-- DELIBERATE CONVENTION EXCEPTION: every other per-line fee column stores a
-- UNIT fee and is multiplied by qty (SCHEMA_DESIGN §2.7). delivery_fee is the
-- ROW TOTAL. A driver's fee is a flat charge for one trip; multiplying it by
-- "qty 3 typing jobs" would silently treble what the customer is charged.
-- The app is the only writer and never multiplies it.
--
-- invoices.delivery_fee stays the single figure every money consumer reads, so
-- it is NOT dropped and NOT made generated: it is recomputed from the lines by
-- the draft-save path (server-side, never accepted from the client) and remains
-- frozen at issue by the §4.1 transition matrix, which still lists
-- delivery_fee for draft→draft only.

-- Backfill: carry existing DRAFT delivery into the grid so no in-progress
-- invoice loses its charge when the editor starts reading the column. The whole
-- amount lands on the lowest-position line — exact by construction, no division
-- and no rounding, and the invoice's own total is unchanged either way.
--
-- Restricted to drafts on purpose. Children of an issued or voided invoice are
-- frozen (the 0005 parent-lock trigger would reject this anyway) and must not
-- move: their sealed record and printed copies already read
-- invoices.delivery_fee and keep rendering identically with the column at 0.
UPDATE public.invoice_lines l
   SET delivery_fee = i.delivery_fee
  FROM public.invoices i
 WHERE i.id = l.invoice_id
   AND i.status = 'draft'
   AND i.delivery_fee > 0
   AND l.position = (
     SELECT MIN(position) FROM public.invoice_lines WHERE invoice_id = i.id
   );
