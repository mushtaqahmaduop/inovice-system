import { z } from "zod";

// Settings input (task 3.2). Structure per SCHEMA_DESIGN §2.1; the VALUES
// stay client-variable (Q-02/Q-03) so nothing business-specific is
// hardcoded here. Q-07 (2026-07-05): the shop prints A4 and A5 — thermal
// was ruled out, so D-26's reopen condition can never fire.

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

export const settingsUpdateSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  companyNameAr: optionalTrimmed(200), // pending Q-08
  tagline: optionalTrimmed(300),
  trn: optionalTrimmed(20), // kept during deregistration, just not printed (F-4b)
  address: optionalTrimmed(500),
  // Phone and email are one-or-more contact "stations" joined with " · "
  // (station N's phone pairs with station N's email on the printed invoice).
  // The form edits them as paired rows; the wire format stays the middot-
  // joined string the invoice doc already splits on.
  phone: optionalTrimmed(200),
  email: optionalTrimmed(500).refine(
    (v) => v === null || v.split("·").every((e) => /^\S+@\S+\.\S+$/.test(e.trim())),
    { message: "Every email must be a valid address" }
  ),
  bankDetails: optionalTrimmed(500),
  vatRegistered: z.boolean(), // D-16 — future invoices only
  vatRateBp: z.number().int().min(0).max(10000), // basis points; 500 = 5%
  invoiceNumberFormat: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .refine((v) => v.includes("{NN}"), { message: "Format must contain {NN}" }), // D-12
  paperSize: z.enum(["A4", "A5"]), // Q-07 answered 2026-07-05: A4+A5, never thermal
  invoiceNotesDefault: optionalTrimmed(2000),
  invoiceTermsDefault: optionalTrimmed(2000),
  dueDaysDefault: z.number().int().min(0).max(365).nullable(),
});

export const paymentMethodCreateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  position: z.number().int().min(0).max(999).default(0),
});

export const paymentMethodUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    isActive: z.boolean(),
    position: z.number().int().min(0).max(999),
  })
  .partial();

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
