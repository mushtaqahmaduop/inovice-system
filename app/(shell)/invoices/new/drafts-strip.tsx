"use client";

import Link from "next/link";
import { Trash2, FileText, ArrowRight } from "lucide-react";
import { canDeleteDraft, useDeleteDraft } from "@/components/invoice/use-delete-draft";

export type StripDraft = {
  id: string;
  created_at: string;
  customer_name: string;
  created_by: string | null;
  item_count: number;
};

// "3h ago" — relative to when the draft was CREATED. Deliberately not labelled
// "modified": drafts carry no updated_at, and autosave would make an invented
// modified time wrong in exactly the cases the operator would rely on it.
function relativeAge(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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
    <div className="mt-10 rounded-[14px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="mb-3 text-[13px] font-semibold text-foreground">Open Drafts</p>
      <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
        {drafts.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 pr-2 transition-colors hover:bg-bg-sunken"
          >
            <Link
              href={`/invoices/${d.id}/edit`}
              className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-accent-border bg-accent-soft text-primary"
              >
                <FileText className="size-[17px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-[19px] font-[550] text-foreground">
                  {d.customer_name}
                </span>
                <span className="block text-[12px] leading-4 text-text-tertiary">
                  {d.item_count} {d.item_count === 1 ? "item" : "items"} · draft
                </span>
              </span>
              <span className="hidden shrink-0 text-end sm:block">
                <span className="mono block text-[12.5px] leading-[18px] text-text-secondary">
                  {fmtDraftDate(d.created_at)}
                </span>
                <span className="block text-[12px] leading-4 text-text-tertiary">
                  Created {relativeAge(d.created_at)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[13px] text-primary">
                Continue <ArrowRight className="size-3.5" />
              </span>
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
