import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecentLine } from "@/app/(shell)/invoices/invoice-editor";

// Recently-used line items for the editor's "Get from recent" picker
// (owner mockup). invoice_lines carry no service_id, so "recent services"
// means the distinct line items actually put on recent invoices — deduped
// by description (case-insensitive), newest first. RLS scopes the read to
// admin/staff (invoice_lines_select, migration 0007).
type RawRow = {
  description: string | null;
  govt_fee: number | null;
  service_fee: number | null;
  invoices: { created_at: string } | { created_at: string }[] | null;
};

function createdAt(r: RawRow): string {
  const inv = r.invoices;
  if (!inv) return "";
  return Array.isArray(inv) ? (inv[0]?.created_at ?? "") : inv.created_at;
}

export async function fetchRecentLines(supabase: SupabaseClient): Promise<RecentLine[]> {
  const { data } = await supabase
    .from("invoice_lines")
    .select("description, govt_fee, service_fee, invoices!inner(created_at)")
    .limit(80);
  const rows = (data ?? []) as RawRow[];
  rows.sort((a, b) => createdAt(b).localeCompare(createdAt(a)));

  const seen = new Set<string>();
  const out: RecentLine[] = [];
  for (const r of rows) {
    const d = (r.description ?? "").trim();
    if (!d) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ description: d, govtFee: r.govt_fee ?? 0, serviceFee: r.service_fee ?? 0 });
    if (out.length >= 20) break;
  }
  return out;
}
