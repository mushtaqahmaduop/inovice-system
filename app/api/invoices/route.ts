import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { draftInvoiceSchema } from "@/lib/validation/invoice";
import { insertChildren } from "@/lib/invoices/draft-children";
import { broadcastInvoicesChanged } from "@/lib/realtime";

// Create a DRAFT invoice (task 4.1b). Staff and admin (RLS §5). Drafts are
// plain multi-row inserts — the one transition that must be a single
// statement is draft→issued via issue_invoice() (task 4.2), never this.
// A failure mid-assembly deletes the draft shell (drafts are the only
// deletable invoices — the 1.2b guard allows it).

export async function POST(request: Request) {
  const guard = await requireUserApi();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = draftInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      customer_id: parsed.data.customerId,
      issue_date: parsed.data.issueDate ?? null,
      notes: parsed.data.notes ?? null,
      terms: parsed.data.terms ?? null,
      display_currency: parsed.data.displayCurrency,
      // AED invoices never carry a rate; foreign ones may still be rate-less
      // while drafting (the issue path enforces a positive rate before sealing).
      exchange_rate_e6:
        parsed.data.displayCurrency === "AED" ? null : (parsed.data.exchangeRateE6 ?? null),
      created_by: guard.ctx.userId,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    // FK violation on customer_id → the picker sent a stale/foreign id.
    const status = invErr?.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: invErr?.message ?? "Insert failed" }, { status });
  }

  const childErr = await insertChildren(supabase, invoice.id, parsed.data);
  if (childErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id); // draft-only delete
    return NextResponse.json({ error: childErr }, { status: 500 });
  }

  await supabase.from("invoice_events").insert({
    invoice_id: invoice.id,
    event_type: "created",
    actor_id: guard.ctx.userId,
    payload: { lines: parsed.data.lines.length, columns: parsed.data.columns.length },
  });

  await broadcastInvoicesChanged();
  return NextResponse.json({ id: invoice.id }, { status: 201 });
}
