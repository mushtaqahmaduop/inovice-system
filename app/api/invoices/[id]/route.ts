import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { draftInvoiceSchema } from "@/lib/validation/invoice";
import { insertChildren } from "@/lib/invoices/draft-children";

// Draft invoice mutations (task 4.1b): update_draft replaces the invoice's
// editable fields and ALL children wholesale (delete + reinsert — simplest
// correct shape for a draft; the 1.2b parent-lock trigger serializes this
// against a concurrent issue, so an edit can never interleave with sealing).
// Issued/voided invoices are immutable: this route answers 409 and the DB
// would raise anyway (three-layer enforcement). No delete action: RLS has
// no DELETE policy for app roles — stale drafts are a cleanup question for
// a later task, not a bypass to add here.

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_draft"), data: draftInvoiceSchema }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUserApi();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Invoice is sealed — corrections happen via a new document." },
      { status: 409 }
    );
  }

  const d = parsed.data.data;
  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      customer_id: d.customerId,
      issue_date: d.issueDate ?? null,
      notes: d.notes ?? null,
      terms: d.terms ?? null,
    })
    .eq("id", id);
  if (updErr) {
    const status = updErr.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: updErr.message }, { status });
  }

  // Replace children. Deleting lines cascades their junction fees.
  const { error: delLines } = await supabase.from("invoice_lines").delete().eq("invoice_id", id);
  if (delLines) return NextResponse.json({ error: delLines.message }, { status: 500 });
  const { error: delCols } = await supabase
    .from("invoice_extra_columns")
    .delete()
    .eq("invoice_id", id);
  if (delCols) return NextResponse.json({ error: delCols.message }, { status: 500 });

  const childErr = await insertChildren(supabase, id, d);
  if (childErr) return NextResponse.json({ error: childErr }, { status: 500 });

  await supabase.from("invoice_events").insert({
    invoice_id: id,
    event_type: "draft_updated",
    actor_id: guard.ctx.userId,
    payload: { lines: d.lines.length, columns: d.columns.length },
  });

  return NextResponse.json({ ok: true });
}
