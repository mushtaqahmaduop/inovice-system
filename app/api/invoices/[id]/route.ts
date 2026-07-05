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
  z.object({ action: z.literal("issue") }),
  z.object({ action: z.literal("log_print") }),
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

  if (parsed.data.action === "issue") {
    // Task 4.2: the ONLY path from draft to issued — a single RPC statement
    // calling the SECURITY DEFINER issue_invoice() (CLAUDE.md §3.1). No
    // BEGIN from the app, no math in application memory feeding the seal.
    const { data: sealed, error } = await supabase.rpc("issue_invoice", {
      p_invoice_id: id,
    });
    if (!error) {
      const row = Array.isArray(sealed) ? sealed[0] : sealed;
      return NextResponse.json({ id, invoiceNumber: row?.invoice_number ?? null });
    }
    if (/is not a draft/.test(error.message)) {
      // R-6: a double-submit or a race with another user. If it ended up
      // issued, that IS success — the client shows the issued invoice.
      const { data: current } = await supabase
        .from("invoices")
        .select("id, status, invoice_number")
        .eq("id", id)
        .maybeSingle();
      if (current?.status === "issued") {
        return NextResponse.json({
          id,
          invoiceNumber: current.invoice_number,
          alreadyIssued: true,
        });
      }
      return NextResponse.json({ error: "Invoice is voided." }, { status: 409 });
    }
    if (/not found/.test(error.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (/has no lines|has no customer/.test(error.message)) {
      return NextResponse.json(
        { error: "An invoice needs a customer and at least one line before it can be issued." },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "log_print") {
    // Best-effort by design: 'printed' means print REQUESTED — the browser
    // cannot confirm completion (SCHEMA_DESIGN §2.11); never a guarantee.
    if (invoice.status === "draft") {
      return NextResponse.json({ error: "Drafts are not printed." }, { status: 409 });
    }
    await supabase.from("invoice_events").insert({
      invoice_id: id,
      event_type: "printed",
      actor_id: guard.ctx.userId,
      payload: {},
    });
    return NextResponse.json({ ok: true });
  }

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
