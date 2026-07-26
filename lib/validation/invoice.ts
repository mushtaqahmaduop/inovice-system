import { z } from "zod";
import { SUPPORTED_CURRENCY_CODES } from "@/lib/currency";

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
    // Foreign-currency DISPLAY layer (AED-anchored). Drafts may carry a currency
    // with the rate still blank (mid-edit) — the presence of a positive rate on
    // a foreign invoice is enforced at the ISSUE path, not on every draft save.
    displayCurrency: z.enum(SUPPORTED_CURRENCY_CODES).default("AED"),
    exchangeRateE6: z.number().int().positive().max(1_000_000_000_000).nullish(),
    // Third-party delivery collected for the customer (D-30). Deliberately NOT
    // part of the sealed totals: issue_invoice() never sees it, and the FTA
    // copy never prints it. It rides on the invoice row so the customer copy
    // and every payment figure can add it to grand_total.
    deliveryFee: fils.default(0),
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
