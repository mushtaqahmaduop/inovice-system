import { formatAed } from "@/lib/money";

// Invoice event timeline (task 5.3) — the audit story. Renders the
// append-only invoice_events rows verbatim: every state change with actor
// and timestamp, from creation to prints. Nothing here is editable and
// nothing is ever missing — the DB forbids UPDATE/DELETE on events (§4.2).

export type EventRow = {
  id: string;
  event_type: string;
  created_at: string;
  actor_name: string | null;
  payload: Record<string, unknown>;
};

const LABELS: Record<string, string> = {
  created: "Created as draft",
  draft_updated: "Draft edited",
  issued: "Issued & sealed",
  payment_recorded: "Payment recorded",
  payment_reversed: "Payment reversed",
  voided: "Voided",
  printed: "Print requested",
  emailed: "Emailed",
};

function detail(e: EventRow): string | null {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "payment_recorded":
      return typeof p.amount === "number" ? `AED ${formatAed(p.amount)}` : null;
    case "payment_reversed":
      return typeof p.amount === "number" ? `−AED ${formatAed(Math.abs(p.amount))}` : null;
    case "voided":
      return typeof p.reason === "string" ? `“${p.reason}”` : null;
    case "created":
      return typeof p.replaces === "string" && p.replaces
        ? `replaces ${p.replaces}`
        : typeof p.lines === "number"
          ? `${p.lines} line${p.lines === 1 ? "" : "s"}`
          : null;
    case "draft_updated":
      return typeof p.lines === "number" ? `${p.lines} line${p.lines === 1 ? "" : "s"}` : null;
    default:
      return null;
  }
}

export function EventTimeline({ events }: { events: EventRow[] }) {
  return (
    <div className="mt-6 border border-border bg-surface p-4 print:hidden">
      <p className="mono mb-3 text-[9px] tracking-[0.16em] text-text-tertiary uppercase">
        History — every change, permanently
      </p>
      <ol className="space-y-0">
        {events.map((e, i) => (
          <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
            {/* rail */}
            <span className="flex flex-col items-center">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  e.event_type === "issued"
                    ? "bg-primary"
                    : e.event_type === "voided"
                      ? "bg-danger"
                      : "bg-text-tertiary"
                }`}
              />
              {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[12.5px] text-foreground">
                {LABELS[e.event_type] ?? e.event_type}
                {detail(e) ? <span className="text-text-secondary"> · {detail(e)}</span> : null}
              </p>
              <p className="mono text-[10px] text-text-tertiary">
                {new Date(e.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
                {e.actor_name ? ` · ${e.actor_name}` : " · system"}
              </p>
            </div>
          </li>
        ))}
        {events.length === 0 ? (
          <li className="text-[12px] text-text-tertiary">No events recorded.</li>
        ) : null}
      </ol>
    </div>
  );
}
