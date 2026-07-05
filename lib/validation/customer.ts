import { z } from "zod";

// Customer input schemas (task 3.1). Q-05 hasn't fixed the final field set,
// so every field beyond name/type stays optional and format-loose — lengths
// are bounded but no TRN/phone format is enforced yet. Tighten here (one
// place, shared by client forms and server routes) when Q-05 lands.

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

export const customerInputSchema = z.object({
  type: z.enum(["regular", "walk_in"]),
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: optionalTrimmed(50),
  email: optionalTrimmed(254).refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), {
    message: "Invalid email",
  }),
  trn: optionalTrimmed(20),
  address: optionalTrimmed(500),
  notes: optionalTrimmed(2000),
});

// Walk-in quick create ([#7]): name is the only requirement.
export const walkInQuickSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: optionalTrimmed(50),
});

export const customerUpdateSchema = customerInputSchema.partial().extend({
  name: z.string().trim().min(1).max(200).optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
