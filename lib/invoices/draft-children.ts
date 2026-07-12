import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftInvoiceInput } from "@/lib/validation/invoice";

// Inserts extra columns, lines and junction fees for a DRAFT invoice
// (shared by the create and update routes, task 4.1b). Callers hold an
// RLS-scoped client; the 1.2b parent-lock trigger backstops every write.
// Returns an error message or null.
export async function insertChildren(
  supabase: SupabaseClient,
  invoiceId: string,
  data: Pick<DraftInvoiceInput, "columns" | "lines">
): Promise<string | null> {
  let columnIds: string[] = [];
  if (data.columns.length > 0) {
    const { data: cols, error } = await supabase
      .from("invoice_extra_columns")
      .insert(
        data.columns.map((c, i) => ({
          invoice_id: invoiceId,
          label: c.label,
          vatable: c.vatable,
          position: i + 1,
        }))
      )
      .select("id, position");
    if (error) return error.message;
    columnIds = (cols ?? []).sort((a, b) => a.position - b.position).map((c) => c.id);
  }

  const { data: lines, error: lineErr } = await supabase
    .from("invoice_lines")
    .insert(
      data.lines.map((l, i) => ({
        invoice_id: invoiceId,
        position: i + 1,
        description: l.description,
        qty: l.qty,
        govt_fee: l.govtFee,
        service_fee: l.serviceFee,
      }))
    )
    .select("id, position");
  if (lineErr) return lineErr.message;
  const lineIds = (lines ?? []).sort((a, b) => a.position - b.position).map((l) => l.id);

  const feeRows = data.lines.flatMap((l, li) =>
    Object.entries(l.extraFees)
      .filter(([, amount]) => amount > 0)
      .map(([colIdx, amount]) => ({
        line_id: lineIds[li],
        column_id: columnIds[Number(colIdx)],
        amount,
      }))
  );
  if (feeRows.length > 0) {
    const { error } = await supabase.from("invoice_line_fees").insert(feeRows);
    if (error) return error.message;
  }
  return null;
}
