import { z } from "zod";

// Services catalogue input (task 3.3). Fees travel the wire as INTEGER FILS
// (CLAUDE.md §3.3) — the client converts AED strings via lib/money.ts before
// sending; the server never parses decimals.

const filsField = z.number().int("Fees must be integer fils").min(0).max(1_000_000_000); // 10M AED — sanity bound, not a business rule

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().min(1).max(30).default("unit"),
  govtFee: filsField.default(0), // unit fee, 0% VAT passthrough
  serviceFee: filsField.default(0), // unit fee, VATable revenue
});

export const serviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    unit: z.string().trim().min(1).max(30),
    govtFee: filsField,
    serviceFee: filsField,
    isActive: z.boolean(),
  })
  .partial();
