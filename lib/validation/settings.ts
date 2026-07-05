import { z } from "zod";

// Settings input (task 3.2). Structure per SCHEMA_DESIGN §2.1; the VALUES
// stay client-variable (Q-02/Q-03/Q-07) so nothing business-specific is
// hardcoded here. paper_size stays locked to A4 until Q-07 answers — a
// "thermal" answer reopens D-09/D-26 with Mushtaq before any code changes.

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
  phone: optionalTrimmed(50),
  email: optionalTrimmed(254).refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), {
    message: "Invalid email",
  }),
  bankDetails: optionalTrimmed(500),
  vatRegistered: z.boolean(), // D-16 — future invoices only
  vatRateBp: z.number().int().min(0).max(10000), // basis points; 500 = 5%
  invoiceNumberFormat: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .refine((v) => v.includes("{NN}"), { message: "Format must contain {NN}" }), // D-12
  paperSize: z.literal("A4"), // pending Q-07 / D-26
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
