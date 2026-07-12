import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi, requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { draftInvoiceSchema } from "@/lib/validation/invoice";
import { insertChildren } from "@/lib/invoices/draft-children";
import { broadcastInvoicesChanged } from "@/lib/realtime";

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
  z.object({
    action: z.literal("void"),
    reason: z.string().trim().min(1, "Reason required").max(500),
    createReplacement: z.boolean().default(false),
  }),
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

  if (parsed.data.action === "void") {
    // Task 4.4 — ADMIN aal2 only (CLAUDE.md §4); the DB function re-checks
    // the admin role so a direct PostgREST RPC cannot bypass this guard.
    const admin = await requireAdminApi();
    if (admin.error) return admin.error;

    const { data: voided, error } = await supabase.rpc("void_invoice", {
      p_invoice_id: id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      if (/not found/.test(error.message)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (/is a draft/.test(error.message)) {
        return NextResponse.json({ error: "Drafts are edited, not voided." }, { status: 422 });
      }
      if (/already voided/.test(error.message)) {
        return NextResponse.json({ error: "Already voided." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const voidedRow = (Array.isArray(voided) ? voided[0] : voided) as {
      customer_id: string;
      notes: string | null;
      terms: string | null;
      invoice_number: string | null;
    };

    await broadcastInvoicesChanged();
    if (!parsed.data.createReplacement) return NextResponse.json({ ok: true });

    // Replacement = a NEW ordinary draft carrying replaces_invoice_id;
    // financials of the voided original stay frozen (corrections are new
    // documents, CLAUDE.md §3.1). Children are copied as fresh draft rows.
    const { data: replacement, error: repErr } = await supabase
      .from("invoices")
      .insert({
        customer_id: voidedRow.customer_id,
        notes: voidedRow.notes,
        terms: voidedRow.terms,
        replaces_invoice_id: id,
        created_by: admin.ctx.userId,
      })
      .select("id")
      .single();
    if (repErr || !replacement) {
      return NextResponse.json(
        { ok: true, replacementError: repErr?.message ?? "replacement failed" },
        { status: 200 } // the void itself succeeded — report that honestly
      );
    }

    const [{ data: cols }, { data: lines }] = await Promise.all([
      supabase
        .from("invoice_extra_columns")
        .select("id, label, vatable, position")
        .eq("invoice_id", id)
        .order("position"),
      supabase
        .from("invoice_lines")
        .select(
          "id, position, description, qty, govt_fee, service_fee, invoice_line_fees(column_id, amount)"
        )
        .eq("invoice_id", id)
        .order("position"),
    ]);
    const colIndexById = new Map((cols ?? []).map((c, i) => [c.id, i]));
    const childErr = await insertChildren(supabase, replacement.id, {
      columns: (cols ?? []).map((c) => ({ label: c.label, vatable: c.vatable })),
      lines: (lines ?? []).map((l) => ({
        description: l.description,
        qty: l.qty,
        govtFee: l.govt_fee,
        serviceFee: l.service_fee,
        extraFees: Object.fromEntries(
          ((l.invoice_line_fees as { column_id: string; amount: number }[]) ?? [])
            .filter((f) => colIndexById.has(f.column_id))
            .map((f) => [String(colIndexById.get(f.column_id)), f.amount])
        ),
      })),
    });
    if (childErr) {
      await supabase.from("invoices").delete().eq("id", replacement.id);
      return NextResponse.json({ ok: true, replacementError: childErr }, { status: 200 });
    }

    await supabase.from("invoice_events").insert({
      invoice_id: replacement.id,
      event_type: "created",
      actor_id: admin.ctx.userId,
      payload: { replaces: voidedRow.invoice_number },
    });

    return NextResponse.json({ ok: true, replacementId: replacement.id });
  }

  if (parsed.data.action === "issue") {
    // A foreign-currency invoice must carry a positive exchange rate before it
    // can be sealed — the rate is frozen at issue and drives the AED-equivalent
    // shown on the (FTA) document. AED invoices need no rate. This is a display
    // prerequisite, not a money-correctness one (the sealed AED math is
    // untouched), so it lives here rather than inside issue_invoice().
    const { data: pre } = await supabase
      .from("invoices")
      .select("display_currency, exchange_rate_e6")
      .eq("id", id)
      .maybeSingle();
    if (
      pre &&
      pre.display_currency !== "AED" &&
      !(pre.exchange_rate_e6 && pre.exchange_rate_e6 > 0)
    ) {
      return NextResponse.json(
        { error: "Set the exchange rate before issuing a foreign-currency invoice." },
        { status: 422 }
      );
    }

    // Task 4.2: the ONLY path from draft to issued — a single RPC statement
    // calling the SECURITY DEFINER issue_invoice() (CLAUDE.md §3.1). No
    // BEGIN from the app, no math in application memory feeding the seal.
    const { data: sealed, error } = await supabase.rpc("issue_invoice", {
      p_invoice_id: id,
    });
    if (!error) {
      const row = Array.isArray(sealed) ? sealed[0] : sealed;
      await broadcastInvoicesChanged();
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
      display_currency: d.displayCurrency,
      exchange_rate_e6: d.displayCurrency === "AED" ? null : (d.exchangeRateE6 ?? null),
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

  await broadcastInvoicesChanged();
  return NextResponse.json({ ok: true });
}
