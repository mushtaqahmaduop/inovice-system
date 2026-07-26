"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

// D-31 — one place for "delete this draft", shared by the invoice list, the
// open-drafts strip and the editor, so the wording of the confirmation and
// the handling of a refused delete are identical wherever it is offered.
//
// The permission rule (admin, or the employee who created the draft) is the
// DB function's to enforce; callers use canDeleteDraft() only to decide
// whether to SHOW the action. A 403 here is a bug in that display logic, not
// a security hole — delete_draft() has already refused.
export function canDeleteDraft(
  row: { status: string; created_by?: string | null },
  viewer: { id: string; isAdmin: boolean }
): boolean {
  return row.status === "draft" && (viewer.isAdmin || row.created_by === viewer.id);
}

export function useDeleteDraft() {
  const router = useRouter();
  const confirm = useConfirm();

  return async function deleteDraft(
    id: string,
    opts: { customerName?: string | null; onDeleted?: () => void } = {}
  ): Promise<boolean> {
    const ok = await confirm({
      title: "Delete this draft?",
      description: (
        <>
          {opts.customerName ? (
            <>
              The draft for <strong className="text-foreground">{opts.customerName}</strong> and its
              lines will be erased.{" "}
            </>
          ) : (
            "The draft and its lines will be erased. "
          )}
          This cannot be undone. A record of who deleted it is kept for the admin. Sealed invoices
          are never affected.
        </>
      ),
      confirmLabel: "Delete draft",
      tone: "danger",
    });
    if (!ok) return false;

    const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? "Could not delete the draft.");
      return false;
    }

    toast.success("Draft deleted.");
    opts.onDeleted?.();
    router.refresh();
    return true;
  };
}
