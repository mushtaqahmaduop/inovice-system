import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";

// Sidebar count badges (DESIGN_BRIEF §3 problem 9): open drafts + overdue
// invoices, RLS-scoped to the caller. Overdue mirrors the invoices-table
// display predicate exactly — due_date, falling back to issue_date +
// settings.due_days_default — so the badge never disagrees with the list.
export async function GET() {
  const auth = await requireUserApi();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const [draftsRes, unpaidRes, settingsRes] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("invoice_list")
      .select("issue_date, due_date")
      .eq("status", "issued")
      .neq("payment_status", "paid"),
    supabase.from("settings").select("due_days_default").limit(1).maybeSingle(),
  ]);

  const dueDaysDefault: number | null = settingsRes.data?.due_days_default ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (unpaidRes.data ?? []).filter((r) => {
    const due =
      r.due_date ??
      (r.issue_date && dueDaysDefault !== null
        ? new Date(new Date(r.issue_date).getTime() + dueDaysDefault * 86400000)
            .toISOString()
            .slice(0, 10)
        : null);
    return due !== null && due < today;
  }).length;

  return NextResponse.json({ drafts: draftsRes.count ?? 0, overdue });
}
