import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

// Global search (task 2.3, D-18; rich palette pass — search.png). Runs
// through the caller's RLS-scoped client — never the server DB connection —
// so results are exactly what the signed-in user is allowed to see. Backed
// by the pg_trgm GIN indexes from migration 0004 (customers.name, invoices
// number btree, customer_snapshot->>'name' expression index); ILIKE '%q%'
// uses them. Drafts are invisible here by design (no number, no snapshot).
// Invoices read invoice_list (migration 0009, security_invoker) so we get
// grand_total / payment_status / issue_date alongside the number.

// One character is enough: invoice numbers are INV-1, INV-2 … so a two-char
// floor made "search an invoice by its number" impossible for the first nine
// invoices of every year — typing 2 returned a 400 and an empty palette.
const querySchema = z.object({ q: z.string().trim().min(1).max(64) });
const LIMIT = 5;

// PostgREST .or() parses commas/parens as syntax and % _ * as wildcards —
// strip them rather than juggling escapes; trigram search doesn't need them.
function sanitize(q: string): string {
  return q
    .replace(/[%_*,()#\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// How people actually type an invoice number: "2", "#2", "inv2", "INV 2",
// "inv-2". Everything but the digits is noise, so pull the sequence out and
// match the number's tail exactly — "2" then finds INV-2 without dragging in
// INV-12 and INV-20, which the plain substring pass still offers anyway.
function invoiceSeq(raw: string): string | null {
  const m = /^#?\s*(?:inv[\s-]*)?(\d{1,9})$/i.exec(raw.trim());
  return m ? m[1] : null;
}

const EMPTY = {
  customers: [],
  customersTotal: 0,
  invoices: [],
  invoicesTotal: 0,
  services: [],
  servicesTotal: 0,
};

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "q must be 1–64 characters" }, { status: 400 });
  }
  const seq = invoiceSeq(parsed.data.q);
  const q = sanitize(parsed.data.q);
  if (q.length < 1) return NextResponse.json(EMPTY);

  const supabase = await createClient();
  // Invoices by number or by the customer name frozen on them; customers by
  // name or phone — the two things staff have in hand at the counter.
  const invoiceOr = [
    `invoice_number.ilike.*${q}*`,
    `customer_snapshot->>name.ilike.*${q}*`,
    ...(seq ? [`invoice_number.ilike.*-${seq}`] : []),
  ].join(",");
  const customerOr = `name.ilike.*${q}*,phone.ilike.*${q}*`;

  const [customersRes, customersCount, invoicesRes, invoicesCount, servicesRes, servicesCount] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, type, phone")
        .is("deleted_at", null)
        .or(customerOr)
        .order("name")
        .limit(LIMIT),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .or(customerOr),
      supabase
        .from("invoice_list")
        .select(
          "id, invoice_number, status, payment_status, grand_total, issue_date, customer_snapshot"
        )
        .or(invoiceOr)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .limit(LIMIT),
      supabase.from("invoice_list").select("id", { count: "exact", head: true }).or(invoiceOr),
      supabase
        .from("services")
        .select("id, name, unit, service_fee")
        .is("deleted_at", null)
        .eq("is_active", true)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(LIMIT),
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("is_active", true)
        .ilike("name", `%${q}%`),
    ]);

  return NextResponse.json({
    customers: customersRes.data ?? [],
    customersTotal: customersCount.count ?? customersRes.data?.length ?? 0,
    invoices: (invoicesRes.data ?? []).map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      payment_status: inv.payment_status,
      grand_total: inv.grand_total,
      issue_date: inv.issue_date,
      customer_name: (inv.customer_snapshot as { name?: string } | null)?.name ?? null,
    })),
    invoicesTotal: invoicesCount.count ?? invoicesRes.data?.length ?? 0,
    services: servicesRes.data ?? [],
    servicesTotal: servicesCount.count ?? servicesRes.data?.length ?? 0,
  });
}
