import { createHash, randomBytes } from "node:crypto";

// One-time MFA recovery codes [#24]. Supabase has no native TOTP recovery
// codes, so we mint our own: 10 chars from a no-confusables alphabet
// (~50 bits), shown once, stored only as SHA-256 hashes.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I/L/O/U/0/1
export const RECOVERY_CODE_COUNT = 8;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let raw = "";
  for (let i = 0; i < 10; i++) raw += ALPHABET[bytes[i] % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
