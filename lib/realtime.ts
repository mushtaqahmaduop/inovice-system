// Server-side realtime emit (task 6.3, ADJUDICATION R-5): the
// broadcast-refetch pattern — mutations send a lightweight "invoices
// changed" signal; clients refetch through normal RLS-checked queries.
// NEVER postgres_changes on core tables ([#26]).
//
// Sent over Realtime's REST endpoint (verified against current Supabase
// docs 2026-07-05: POST /realtime/v1/api/broadcast) — no WebSocket needed
// server-side, which also sidesteps Node 20's missing WebSocket. The
// channel is public and the payload carries NOTHING but the signal; all
// data flows through RLS on refetch.

export const INVOICES_CHANNEL = "invoices";
export const INVOICES_CHANGED_EVENT = "changed";

export async function broadcastInvoicesChanged(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: INVOICES_CHANNEL, event: INVOICES_CHANGED_EVENT, payload: {} }],
      }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort by design: a missed signal only delays a refetch; the
    // data itself is never at risk.
  } finally {
    clearTimeout(timer);
  }
}
