import { z } from "zod";

// Draft invoice wire format (task 4.1b). All money is INTEGER FILS (§3.3);
// the client converts AED at the edge (lib/money.ts). Extra-column cell
// amounts are keyed by the column's INDEX in the columns array — DB ids
// don't exist yet on first save, and updates replace children wholesale.
// Drafts are freely editable (CLAUDE.md §3.1); totals are never accepted
// from the client — issue_invoice() recomputes at sealing.

const fils = z.number().int().min(0).max(1_000_000_000);

const extraColumn = z.object({
  label: z.string().trim().min(1, "Column label required").max(40),
  vatable: z.boolean(),
});

const line = z.object({
  description: z.string().trim().max(500), // may be empty while drafting
  qty: z.number().int().min(1).max(9999),
  govtFee: fils,
  serviceFee: fils,
  /** column index (as string) → unit fils; sparse, zeros omitted */
  extraFees: z.record(z.string(), fils).default({}),
});

export const draftInvoiceSchema = z
  .object({
    customerId: z.uuid(),
    issueDate: z.iso.date().nullish(),
    notes: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => (v === "" ? null : v))
      .nullish(),
    terms: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => (v === "" ? null : v))
      .nullish(),
    columns: z.array(extraColumn).max(6),
    lines: z.array(line).min(1, "At least one line").max(100),
  })
  .superRefine((v, ctx) => {
    for (const [li, l] of v.lines.entries()) {
      for (const key of Object.keys(l.extraFees)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= v.columns.length) {
          ctx.addIssue({
            code: "custom",
            message: `line ${li}: extra fee references unknown column ${key}`,
            path: ["lines", li, "extraFees"],
          });
        }
      }
    }
  });

export type DraftInvoiceInput = z.infer<typeof draftInvoiceSchema>;
