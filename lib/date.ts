// Business timezone helpers.
//
// The business operates in Asia/Dubai (UTC+4, no DST) but the server clock on
// Vercel is UTC. Any "today" that becomes an invoice or payment DATE must be
// computed in the business timezone — otherwise a document created between
// 00:00 and 03:59 Dubai time is stamped with the PREVIOUS calendar day, and at
// a month boundary that drops the invoice or payment into the wrong VAT period
// on a legal FTA document. `Intl` with `timeZone` is the same mechanism the
// dashboard and the draft-date strip already use for display.

/** Today's calendar date in the business timezone, as `YYYY-MM-DD`. */
export function todayInDubai(): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the <input type="date"> and
  // Postgres `date` wire format.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}
