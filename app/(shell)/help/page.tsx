import type { Metadata } from "next";
import {
  Bug,
  Clock,
  Headset,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  BookOpen,
  Phone,
} from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import {
  BUG_PREFILL,
  CONTACT_PREFILL,
  FEATURE_PREFILL,
  SUPPORT_ADDRESS,
  SUPPORT_EMAILS,
  SUPPORT_PHONES,
  SUPPORT_RESPONSE_TIME,
  mailtoUrl,
  whatsappUrl,
} from "@/lib/support";

export const metadata: Metadata = { title: "Need help?" };

// Help & Support (owner request 2026-07-31, design from the supplied mockup).
//
// Replaces the sidebar's old link out to the GitHub README — the owner does
// not want staff sent to the repository. Every route on this page therefore
// terminates at the OWNER: WhatsApp or email, never an issue tracker.
//
// The user manual and the FAQ library are explicitly a later piece of work;
// until they exist the guide panel states that plainly instead of shipping a
// dead "View guides" button. A placeholder that admits what it is beats a
// link that goes nowhere.

const primary = SUPPORT_PHONES[0];

// The four routes, in the mockup's order. `external` opens a new tab;
// mailto/wa.me are both handed to the OS, so neither is a same-tab navigation.
const ROUTES = [
  {
    icon: MessageCircle,
    tone: "accent",
    title: "Contact Support",
    body: "Get assistance from the support team for any issue.",
    cta: "Message on WhatsApp",
    href: whatsappUrl(primary, CONTACT_PREFILL),
  },
  {
    icon: Bug,
    tone: "success",
    title: "Report an Issue",
    body: "Found a bug or something not working as expected?",
    cta: "Report a problem",
    href: whatsappUrl(primary, BUG_PREFILL),
  },
  {
    icon: Lightbulb,
    tone: "warn",
    title: "Request a Feature",
    body: "Have an idea to improve the system? Let us know.",
    cta: "Suggest an idea",
    href: mailtoUrl(SUPPORT_EMAILS[0], "Feature request — invoice system", FEATURE_PREFILL),
  },
  {
    icon: BookOpen,
    tone: "neutral",
    title: "User Guide",
    body: "Step-by-step guides for every screen in the system.",
    cta: "In preparation",
    href: null,
  },
] as const;

// Icon chips. Tailwind cannot see class names assembled at runtime, so each
// tone is written out in full.
const TONE: Record<(typeof ROUTES)[number]["tone"], string> = {
  accent: "bg-accent-soft text-primary",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-[var(--warn)]",
  neutral: "bg-[var(--neutral-soft)] text-text-secondary",
};

const CARD = "rounded-[14px] border border-border bg-surface";

export default async function HelpPage() {
  await requireUser();

  return (
    <div className="w-full px-5 py-6 md:px-8">
      {/* ── Hero ── */}
      <section className={`${CARD} mb-5 overflow-hidden`}>
        <div className="flex items-start gap-4 p-6 md:p-7">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
            <Headset className="size-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[26px] leading-8 font-semibold tracking-tight text-foreground md:text-[30px] md:leading-9">
              Need Help?
            </h2>
            <p className="mt-1 text-[14px] leading-5 text-text-secondary">
              We&apos;re here to help you succeed. Choose how you&apos;d like to get support.
            </p>
          </div>
        </div>
      </section>

      {/* ── The four routes ── */}
      <section className={`${CARD} mb-5 p-5 md:p-6`}>
        <h3 className="mb-4 text-[16px] leading-6 font-semibold text-foreground">
          How can we help you?
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ROUTES.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.title}
                className="flex flex-col rounded-[12px] border border-border bg-bg-sunken p-4"
              >
                <span
                  className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${TONE[r.tone]}`}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <p className="text-[15px] leading-5 font-semibold text-foreground">{r.title}</p>
                <p className="mt-1 mb-4 flex-1 text-[13px] leading-[19px] text-text-secondary">
                  {r.body}
                </p>
                {r.href ? (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-[550] text-foreground transition-colors hover:border-border-strong hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {r.cta}
                    <span aria-hidden>→</span>
                  </a>
                ) : (
                  // Not a disabled button: there is nothing to press yet, so it
                  // reads as a status line rather than a control that ignores you.
                  <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-dashed border-border px-3 text-[13px] font-medium text-text-tertiary">
                    {r.cta}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Contact information ── */}
        <section className={`${CARD} p-5 md:p-6`}>
          <h3 className="text-[16px] leading-6 font-semibold text-foreground">
            Contact Information
          </h3>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            Reach the system owner directly on any of these.
          </p>

          <ul className="mt-5 divide-y divide-border">
            {/* Email */}
            <li className="flex gap-3 py-4 first:pt-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-primary">
                <Mail className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-5 font-semibold text-foreground">Email Support</p>
                <div className="mt-1 flex flex-col gap-0.5">
                  {SUPPORT_EMAILS.map((e) => (
                    <a
                      key={e}
                      href={mailtoUrl(e, "Support — invoice system")}
                      className="text-[13px] leading-5 break-all text-primary underline-offset-2 hover:underline"
                    >
                      {e}
                    </a>
                  ))}
                </div>
              </div>
            </li>

            {/* Phone / WhatsApp */}
            <li className="flex gap-3 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-success-soft text-success">
                <Phone className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-5 font-semibold text-foreground">
                  Phone / WhatsApp
                </p>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {SUPPORT_PHONES.map((p) => (
                    <div key={p.e164} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a
                        href={`tel:+${p.e164}`}
                        className="mono text-[13px] leading-5 text-foreground underline-offset-2 hover:underline"
                      >
                        {p.display}
                      </a>
                      <span className="text-[11px] text-text-tertiary">{p.label}</span>
                      <a
                        href={whatsappUrl(p, CONTACT_PREFILL)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-6 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-[550] text-success transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <MessageCircle className="size-3" strokeWidth={2} aria-hidden />
                        WhatsApp
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </li>

            {/* Address */}
            <li className="flex gap-3 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--neutral-soft)] text-text-secondary">
                <MapPin className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-5 font-semibold text-foreground">Address</p>
                <p className="mt-1 text-[13px] leading-5 text-text-secondary">{SUPPORT_ADDRESS}</p>
              </div>
            </li>

            {/* Response time */}
            <li className="flex gap-3 py-4 last:pb-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-warn-soft text-[var(--warn)]">
                <Clock className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-5 font-semibold text-foreground">Response Time</p>
                <p className="mt-1 text-[13px] leading-5 text-text-secondary">
                  {SUPPORT_RESPONSE_TIME}
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* ── Guide (pending) + the closing CTA ── */}
        <section className={`${CARD} flex flex-col p-5 md:p-6`}>
          <h3 className="text-[16px] leading-6 font-semibold text-foreground">
            User Manual &amp; Guides
          </h3>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            Written walkthroughs for every screen — invoicing, payments, customers, exports.
          </p>

          <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-bg-sunken px-5 py-9 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-[var(--neutral-soft)] text-text-tertiary">
              <BookOpen className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-3 text-[14px] leading-5 font-semibold text-foreground">
              Being prepared
            </p>
            <p className="mt-1 max-w-[38ch] text-[13px] leading-[19px] text-text-secondary">
              The manual and the frequently-asked-questions library are still being written. Until
              they land, message us directly — we answer {SUPPORT_RESPONSE_TIME.toLowerCase()}.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[12px] bg-accent-soft p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-accent">
              <Headset className="size-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-5 font-semibold text-foreground">
                Still need help?
              </p>
              <p className="text-[13px] leading-[19px] text-text-secondary">
                We&apos;re ready to assist you.
              </p>
            </div>
            <a
              href={whatsappUrl(primary, CONTACT_PREFILL)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-[550] text-on-accent transition-colors hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MessageCircle className="size-4" strokeWidth={2} aria-hidden />
              Contact Support
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
