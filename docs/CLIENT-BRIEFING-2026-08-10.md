# Client briefing — domain, database and hosting

**For:** Prestige Land Typing Center
**From:** Mushtaq Ahmed — Zeerak Hostix
**Date:** 10 August 2026
**Purpose:** the invoice system is built, tested and empty of practice data. It
is ready for real invoices. Before it goes into daily use there are four
decisions that are yours to make, all about *where the system lives and who owns
it*. This document explains each one in plain terms, with real costs.

Nothing here is a change to the software. The software is done.

---

## Where things stand today

- The system is live and working. Your 43 services, your 62 customers, your
  payment methods and your company details are all loaded.
- All practice invoices have been deleted. **Your first real invoice will be
  numbered INV-1.**
- Four accounts exist: two admin (yourself and Noor) and two staff (Fawad and
  Mohammed Sahil). The nine accounts used during building have been removed.
- Every invoice, once issued, is permanently sealed and cannot be altered by
  anyone — including us. Corrections happen by voiding and re-issuing, which is
  what the UAE Federal Tax Authority expects.

---

## Decision 1 — Buy a domain name

### What you have now

The system is reached at:

```
inovice-system-lyart.vercel.app
```

That address was generated automatically by the hosting company. The `lyart`
part is a random word their system added. You do not own this address, you
cannot choose it, and it can change if the project is ever renamed or moved.

**This is not theoretical.** While preparing this handover we found that the
address written in your training documents — a slightly different version of the
above — does not work at all. Your staff would have been given a dead link on
day one. We caught it and corrected every document. (Signing in and resetting
passwords were never affected; those use a code sent to your email rather than a
web link, by design.)

The point stands regardless: that address is generated and controlled by the
hosting company, not by you, which is precisely why it could change out from
under the documentation.

### What a domain gives you

A domain is an address you own and renew yearly, for example:

```
prestigeland.ae          →  invoices.prestigeland.ae
```

The honest case for buying one, specific to your situation:

1. **Permanence.** The address stops depending on our hosting account or a
   project name. If we ever move the system to a different host — or if you
   ever move it to a different developer — the address stays exactly the same
   and everything keeps working. Bookmarks, saved passwords, the reset emails,
   the staff's muscle memory: all unaffected.
2. **It is genuinely yours.** Registered in your company's name, it is a
   business asset like your trade licence. Today the address is ours, and that
   is an unnecessary dependency between your daily operations and our accounts.
3. **Staff-facing professionalism.** Your team types this address every morning.
   `invoices.prestigeland.ae` is memorable; the current one is not, and every
   new employee has to be told the random word.
4. **It reserves your name.** Once someone else registers `prestigeland.ae`, it
   is gone. Registering it costs less than one typing job.
5. **It opens up business email** — `accounts@prestigeland.ae` instead of a
   Gmail address — if you ever want that. Separate service and separate cost,
   but impossible without the domain.

### The fair counter-argument

This system is an internal tool used by about ten people, not a public website
that customers browse. You told us in July that a domain was not required, and
for a purely internal tool that was a reasonable decision. The benefit is not
marketing — it is **ownership and permanence**, which is why we are raising it
again now that the system holds real financial records.

### Cost

| Option | Typical price | Notes |
|---|---|---|
| `.ae` (UAE) | **AED 125 – 180 per year** | Signals a UAE-registered business; may require trade-licence documents |
| `.com` | **≈ AED 45 – 60 per year** | Cheapest, internationally familiar, no documents needed |
| Both | ≈ AED 185 – 240 per year | Common practice: register both, point one at the other |

Prices vary by registrar and are current as of August 2026 — we will confirm the
exact figure before purchasing. Setup on our side is about 15 minutes and is
included; there is no charge from us for connecting it.

**Our recommendation:** register `.ae` if you want the UAE identity, `.com` if
you want the cheapest permanent address. Either solves the ownership problem.
The domain must be registered **in your company's name**, not ours — that is the
whole point, and it is what our agreement already says (D-04).

---

## Decision 2 — The database plan

### What the database is

Everything the system knows lives in a managed PostgreSQL database run by a
company called **Supabase**: your customers, services, invoices, payments and
the permanent audit log of every action taken. It currently sits in their
**Mumbai (ap-south-1)** region, which is the closest to Dubai and gives the
fastest response for your staff.

*If your accountant or legal advisor requires records to be stored inside the
UAE, tell us — it changes the hosting choice and we should discuss it before you
issue invoices, not after.*

### Why the paid plan matters

| | Free plan | **Pro plan — recommended** |
|---|---|---|
| Daily automatic backups | ✗ | ✓ |
| Pauses itself when idle | **Yes — after a week of inactivity** | Never |
| Support | Community | Email support |
| Cost | AED 0 | **≈ AED 92 / month (USD 25)** |

The auto-pause on the free plan is the deciding factor. A paused database means
a staff member opens the system on a quiet Monday and cannot issue an invoice
until someone wakes it up. That is not acceptable for a business that invoices
customers face to face.

### Your 5-year record retention — read this part

UAE FTA rules require invoice records to be kept for **five years**. Supabase's
daily backups are *disaster recovery* — they go back days, not years. They are
not your retention.

Your retention is a **monthly export** of the complete ledger to storage that
**you** own, which we then test-restore every quarter to prove the file actually
works. The scripts and the written procedure for this are built and tested
already.

**What we need from you: where do those monthly files go?** Options — the
business's Google Drive or Microsoft account, a USB drive kept in the office
safe, or both. Until you choose, the only copies sit on our laptop, which is not
good enough for a legal retention obligation. **This is the single most
important answer we need from you today.**

---

## Decision 3 — The hosting plan

### What hosting does

The application itself — the screens your staff use — runs on **Vercel**. They
handle the servers, the security certificate, and keeping the site online. An
automated monitor checks the system from outside and emails us if it stops
responding.

### The plan question

Vercel's free tier is licensed for **personal, non-commercial projects only**.
A system that invoices paying customers is commercial use, so the correct plan
for a business is their **Pro** plan at **USD 20 per month (≈ AED 73)**, which
includes USD 20 of monthly usage — comfortably more than a ten-person typing
centre will ever use.

We are confirming which plan the project currently sits on and will move it if
needed. We raise it because it is a licensing question about *your* business
system, and you should not learn about it later.

---

## Decision 4 — Ownership and what happens if we part ways

Our agreement (D-04) already says: **you own the domain; we operate the hosting
and database accounts under Zeerak Hostix.** That arrangement is normal and
keeps day-to-day operation simple, but you should know exactly what it means:

- **The invoice data is yours, unconditionally.** The monthly export exists
  precisely so that a complete, readable copy of your ledger is in your hands
  and independent of us, every month.
- **If you ever want the accounts transferred into your own name**, both Vercel
  and Supabase support that, and we will do it. It is a paperwork exercise, not
  a rebuild.
- **The domain being in your name** is what makes that transfer painless — see
  Decision 1.

---

## What it costs to run, per year

| Item | Yearly |
|---|---|
| Database (Supabase Pro) | ≈ AED 1,100 |
| Hosting (Vercel Pro) | ≈ AED 880 |
| Domain (`.ae`) | ≈ AED 125 – 180 |
| **Total** | **≈ AED 2,100 – 2,160 per year** |

That is roughly **AED 180 per month** to run the whole system. Our agreement
(D-02) has the first three months of hosting paid at go-live.

Figures are converted at approximately AED 3.67 to the US dollar and exclude
VAT charged by the vendors themselves. Both platforms bill monthly in USD and
can be cancelled at any time.

---

## What we need from you

| # | Question | Why it matters |
|---|---|---|
| 1 | **Where do the monthly backup files go?** | Your 5-year FTA retention depends on it. Most urgent. |
| 2 | **Do you want a domain — `.ae`, `.com`, or both?** | Ownership and permanence of your system's address. |
| 3 | **Any requirement that data stays inside the UAE?** | Changes the hosting decision; cheaper to answer now. |
| 4 | **Who pays the platform bills — you directly, or us with rebilling?** | Affects whether accounts go in your name now or later. |

Once we have answers 1 and 2 we can complete the handover session with Mr Sahil
and the system is fully yours to run.

---

### Training and support

The full walkthrough is in `HANDOVER-walkthrough.md` and the day-to-day guide in
`USER-MANUAL.md`. The training session covers issuing an invoice, taking a
payment, finding who owes money, and what to do when a mistake is sealed. Mr
Sahil is the nominated attendee.

The one rule that explains the whole system: **a draft can be changed freely; a
sealed invoice can never be changed by anyone.** Mistakes are corrected by
voiding and re-issuing, and every action is permanently logged with the name of
the person who took it. That is not a limitation of the software — it is what
makes your books defensible if the FTA ever asks.
