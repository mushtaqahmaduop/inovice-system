"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { canDeleteDraft, useDeleteDraft } from "@/components/invoice/use-delete-draft";

export type StripDraft = {
  id: string;
  created_at: string;
  customer_name: string;
  created_by: string | null;
};

// Open-drafts strip on /invoices/new — the resume path for drafts, which have
// no number and stay out of global search. Client-side only because of the
// delete action (D-31); the row itself is still a plain Link, with the delete
// button rendered BESIDE it rather than inside it (a button inside an anchor
// is invalid, and the whole row would swallow the click).
// Dates per PREMIUM_EXECUTION_GUIDE §2.3 — "07 Jul 2026, 14:05", mono,
// business timezone (the server clock is UTC on Vercel).
function fmtDraftDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dubai",
  });
  return `${date}, ${time}`;
}

export function DraftsStrip({
  drafts,
  viewerId,
  viewerIsAdmin,
}: {
  drafts: StripDraft[];
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const deleteDraft = useDeleteDraft();
  if (drafts.length === 0) return null;

  return (
    <div className="mt-12 border-t border-border pt-6">
      <p className="mb-3 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Open drafts
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-surface">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 pr-2 text-[13px] leading-[19px] transition-colors hover:bg-bg-sunken"
          >
            <Link
              href={`/invoices/${d.id}/edit`}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{d.customer_name}</span>
              <span className="mono text-[13px] text-text-tertiary">
                {fmtDraftDate(d.created_at)}
              </span>
              <span className="text-[13px] text-text-secondary">Resume →</span>
            </Link>
            {canDeleteDraft(
              { status: "draft", created_by: d.created_by },
              {
                id: viewerId,
                isAdmin: viewerIsAdmin,
              }
            ) ? (
              <button
                type="button"
                onClick={() => deleteDraft(d.id, { customerName: d.customer_name })}
                aria-label={`Delete draft for ${d.customer_name}`}
                title="Delete draft"
                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-text-tertiary transition-colors hover:bg-surface hover:text-error"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
