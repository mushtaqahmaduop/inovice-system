import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { csvDocument, filsToCsvAed } from "@/lib/csv";

// CSV exports (task 6.2, D-18): invoices, payments, and the per-period VAT
// report basis. ADMIN aal2 only — bulk export is the largest data-egress
// surface in the app. Drafts are excluded everywhere (no sealed
// financials); voided invoices are included and labeled so the accountant
// decides their treatment. All money from sealed columns, integer math.

const querySchema = z.object({
  kind: z.enum(["invoices", "payments", "vat"]),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const { kind } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    kind,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }
  const { from, to } = parsed.data;
  const supabase = await createClient();

  let csv: string;
  if (parsed.data.kind === "payments") {
    let q = supabase
      .from("payments")
      .select(
        "received_on, amount, reference, reverses_payment_id, method_id, invoice_id, recorded_by"
      )
      .order("received_on");
    if (from) q = q.gte("received_on", from);
    if (to) q = q.lte("received_on", to);
    const [{ data: rows }, { data: methods }, { data: invoices }, { data: profiles }] =
      await Promise.all([
        q,
        supabase.from("payment_methods").select("id, label"),
        supabase.from("invoices").select("id, invoice_number"),
        supabase.from("profiles").select("id, full_name"),
      ]);
    const methodLabel = new Map((methods ?? []).map((m) => [m.id, m.label]));
    const invNumber = new Map((invoices ?? []).map((i) => [i.id, i.invoice_number]));
    const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    csv = csvDocument(
      [
        "received_on",
        "invoice_number",
        "amount_aed",
        "method",
        "reference",
        "is_reversal",
        "recorded_by",
      ],
      (rows ?? []).map((p) => [
        p.received_on,
        invNumber.get(p.invoice_id) ?? "",
        filsToCsvAed(p.amount),
        methodLabel.get(p.method_id) ?? "",
        p.reference,
        p.reverses_payment_id ? "yes" : "no",
        person.get(p.recorded_by ?? "") ?? "",
      ])
    );
  } else {
    // invoices & vat share the source: sealed documents in the period.
    let q = supabase
      .from("invoice_list")
      .select(
        "invoice_number, status, payment_status, issue_date, customer_snapshot, vat_registered_snapshot, vat_rate_bp_snapshot, subtotal_govt, subtotal_service, subtotal_extras, vat_amount, grand_total, paid_total"
      )
      .neq("status", "draft")
      .order("issue_date");
    if (from) q = q.gte("issue_date", from);
    if (to) q = q.lte("issue_date", to);
    const { data: rows } = await q;
    type Row = NonNullable<typeof rows>[number];
    const name = (r: Row) => (r.customer_snapshot as { name?: string } | null)?.name ?? "";

    csv =
      parsed.data.kind === "invoices"
        ? csvDocument(
            [
              "invoice_number",
              "status",
              "issue_date",
              "customer",
              "govt_fees_aed",
              "service_fees_aed",
              "other_charges_aed",
              "vat_aed",
              "grand_total_aed",
              "paid_aed",
              "payment_status",
            ],
            (rows ?? []).map((r) => [
              r.invoice_number,
              r.status,
              r.issue_date,
              name(r),
              filsToCsvAed(r.subtotal_govt ?? 0),
              filsToCsvAed(r.subtotal_service ?? 0),
              filsToCsvAed(r.subtotal_extras ?? 0),
              filsToCsvAed(r.vat_amount ?? 0),
              filsToCsvAed(r.grand_total ?? 0),
              filsToCsvAed(r.paid_total ?? 0),
              r.payment_status ?? "",
            ])
          )
        : csvDocument(
            // VAT report BASIS (the accountant's V-1..V-6 answers finalize
            // the actual return format — this is deliberately raw).
            [
              "invoice_number",
              "status",
              "issue_date",
              "customer",
              "vat_registered",
              "vat_rate_percent",
              "non_taxable_govt_aed",
              "taxable_base_aed",
              "vat_aed",
              "grand_total_aed",
            ],
            (rows ?? []).map((r) => [
              r.invoice_number,
              r.status,
              r.issue_date,
              name(r),
              r.vat_registered_snapshot ? "yes" : "no",
              ((r.vat_rate_bp_snapshot ?? 0) / 100).toString(),
              filsToCsvAed(r.subtotal_govt ?? 0),
              // Taxable base = service + extras as sealed; the per-column
              // vatable split lives in the children if ever needed.
              filsToCsvAed((r.subtotal_service ?? 0) + (r.subtotal_extras ?? 0)),
              filsToCsvAed(r.vat_amount ?? 0),
              filsToCsvAed(r.grand_total ?? 0),
            ])
          );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${parsed.data.kind}-${from ?? "all"}-${to ?? stamp}.csv"`,
    },
  });
}
