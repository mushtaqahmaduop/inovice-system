import { z } from "zod";

// Payment wire formats (task 5.1). Payments are an INSERT-ONLY ledger
// (D-14/§4.2): recording adds a positive row; corrections add a NEGATIVE
// reversal row paired via reverses_payment_id — no UPDATE path exists
// anywhere. Amounts are integer fils (§3.3), strictly positive on the
// wire; only the reversal path writes negatives, server-side.

export const recordPaymentSchema = z.object({
  type: z.literal("record"),
  amount: z.number().int().min(1, "Amount must be positive").max(1_000_000_000),
  methodId: z.uuid(),
  receivedOn: z.iso.date(),
  reference: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v))
    .nullish(),
});

export const reversePaymentSchema = z.object({
  type: z.literal("reverse"),
  paymentId: z.uuid(),
});

export const paymentActionSchema = z.discriminatedUnion("type", [
  recordPaymentSchema,
  reversePaymentSchema,
]);
