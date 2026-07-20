import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { paymentActionSchema } from "@/lib/validation/payment";
import { broadcastInvoicesChanged } from "@/lib/realtime";
import { todayInDubai } from "@/lib/date";

// Payments on an invoice (task 5.1). Staff and admin both record and
// reverse (RLS §5: payments are INSERT for both; reversals ARE inserts).
// Status is never written anywhere — the invoice_list view derives
// unpaid/partial/paid from SUM(payments) at read time (§6).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUserApi();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = paymentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, invoice_number")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status !== "issued") {
    return NextResponse.json(
      {
        error:
          invoice.status === "draft"
            ? "Drafts carry no payments — issue the invoice first."
            : "This invoice is voided — record the payment on its replacement.",
      },
      { status: 409 }
    );
  }

  if (parsed.data.type === "record") {
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        invoice_id: id,
        amount: parsed.data.amount,
        method_id: parsed.data.methodId,
        received_on: parsed.data.receivedOn,
        reference: parsed.data.reference ?? null,
        recorded_by: guard.ctx.userId,
      })
      .select("id")
      .single();
    if (error) {
      const status = error.code === "23503" ? 400 : 500; // unknown method
      return NextResponse.json({ error: error.message }, { status });
    }
    await supabase.from("invoice_events").insert({
      invoice_id: id,
      event_type: "payment_recorded",
      actor_id: guard.ctx.userId,
      payload: { payment_id: payment.id, amount: parsed.data.amount },
    });
    await broadcastInvoicesChanged();
    return NextResponse.json({ id: payment.id }, { status: 201 });
  }

  // Reversal: a NEGATIVE row paired with the original (D-14 [#6]).
  const { data: original } = await supabase
    .from("payments")
    .select("id, amount, method_id, reverses_payment_id")
    .eq("id", parsed.data.paymentId)
    .eq("invoice_id", id)
    .maybeSingle();
  if (!original) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (original.amount < 0 || original.reverses_payment_id) {
    return NextResponse.json({ error: "Reversal rows cannot be reversed." }, { status: 400 });
  }
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("reverses_payment_id", original.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This payment is already reversed." }, { status: 409 });
  }

  const { data: reversal, error: revErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: id,
      amount: -original.amount,
      method_id: original.method_id,
      received_on: todayInDubai(),
      reference: `reversal of payment ${original.id}`,
      reverses_payment_id: original.id,
      recorded_by: guard.ctx.userId,
    })
    .select("id")
    .single();
  if (revErr) {
    // The `select` above is racy: two concurrent reversals of the same payment
    // can both pass the "already reversed?" check. The DB's partial unique index
    // on reverses_payment_id (migration 0012) is the real guard — it makes the
    // loser fail with 23505, which is the same user-facing outcome as the
    // pre-check: this payment is already reversed.
    const status = revErr.code === "23505" ? 409 : 500;
    const message = revErr.code === "23505" ? "This payment is already reversed." : revErr.message;
    return NextResponse.json({ error: message }, { status });
  }

  await supabase.from("invoice_events").insert({
    invoice_id: id,
    event_type: "payment_reversed",
    actor_id: guard.ctx.userId,
    payload: { payment_id: original.id, reversal_id: reversal.id, amount: -original.amount },
  });
  await broadcastInvoicesChanged();
  return NextResponse.json({ id: reversal.id }, { status: 201 });
}
