// Support contact details (owner-supplied, 2026-07-31) — the SINGLE source
// of truth for /help. Kept in one dependency-free module so the numbers live
// in exactly one place: the page, any future footer, and the "still need
// help" CTA all read from here rather than repeating a phone number that
// later goes stale.
//
// Deliberately NOT in `settings`: those columns are the CENTRE's own details
// as printed on customer invoices (Prestige Land, Al Ain, UAE). These are the
// SYSTEM operator's — where staff go when the software misbehaves. Mixing the
// two would put a Peshawar number on a UAE tax invoice.

/** E.164, digits only — the form wa.me requires (no +, no spaces). */
export type SupportPhone = {
  /** Digits only, country code first: what wa.me expects in its path. */
  e164: string;
  /** Human-readable, grouped for legibility. */
  display: string;
  label: string;
};

export const SUPPORT_PHONES: SupportPhone[] = [
  { e164: "923189981202", display: "+92 318 998 1202", label: "Primary" },
  // Supplied as "+03428521842". A leading "+0" is not a dialable form: 0342
  // is the Pakistani LOCAL trunk prefix for the +92 342 mobile block, so this
  // is the same subscriber written domestically. Normalised to E.164 here
  // because wa.me and tel: both reject the "+0" form outright.
  { e164: "923428521842", display: "+92 342 852 1842", label: "Alternate" },
];

export const SUPPORT_EMAILS: string[] = ["mushtaqkmcite@gmail.com", "mushtaqahmadicp@gmail.com"];

export const SUPPORT_ADDRESS = "Peshawar, Pakistan";

/** Owner's committed turnaround, shown verbatim on the page. */
export const SUPPORT_RESPONSE_TIME = "Within 12 hours";

/** wa.me deep link. `text` is prefilled into the chat so the operator does
 *  not have to describe which system they are calling about. */
export function whatsappUrl(phone: SupportPhone, text?: string): string {
  const base = `https://wa.me/${phone.e164}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function mailtoUrl(email: string, subject?: string, body?: string): string {
  // NOT URLSearchParams: it percent-encodes a space as "+", which is correct
  // for form bodies but wrong here — RFC 6068 mailto headers require %20, and
  // clients that follow it show a literal "Support+—+invoice+system" in the
  // subject line. encodeURIComponent gives %20.
  const parts: string[] = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${email}${parts.length ? `?${parts.join("&")}` : ""}`;
}

/** Prefill text shared by the contact routes — names the product so a message
 *  arriving cold is immediately identifiable. */
export const CONTACT_PREFILL = "Hello, I need help with the Prestige Land invoice system.";
export const BUG_PREFILL =
  "Hello, I want to report a problem with the Prestige Land invoice system.\n\nWhat I was doing:\nWhat I expected:\nWhat happened instead:";
export const FEATURE_PREFILL =
  "Hello,\n\nI would like to suggest an improvement to the Prestige Land invoice system.\n\nWhat I would like:\nWhy it would help:";
