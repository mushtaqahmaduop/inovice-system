import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

// Global search (task 2.3, D-18). Runs through the caller's RLS-scoped
// client — never the server DB connection — so results are exactly what the
// signed-in user is allowed to see. Backed by the pg_trgm GIN indexes from
// migration 0004 (customers.name, invoices.invoice_number is btree-covered,
// customer_snapshot->>'name' expression index) — ILIKE '%q%' uses them.
// Drafts are invisible here by design: no number, no snapshot yet.

const querySchema = z.object({ q: z.string().trim().min(2).max(64) });

// PostgREST .or() parses commas/parens as syntax and % _ * as wildcards —
// strip them rather than juggling escapes; trigram search doesn't need them.
function sanitize(q: string): string {
  return q
    .replace(/[%_*,()\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "q must be 2–64 characters" }, { status: 400 });
  }
  const q = sanitize(parsed.data.q);
  if (q.length < 2) return NextResponse.json({ customers: [], invoices: [] });

  const supabase = await createClient();
  const [customersRes, invoicesRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, type")
      .is("deleted_at", null)
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(8),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, customer_snapshot")
      .or(`invoice_number.ilike.*${q}*,customer_snapshot->>name.ilike.*${q}*`)
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  return NextResponse.json({
    customers: customersRes.data ?? [],
    invoices: (invoicesRes.data ?? []).map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      customer_name: (inv.customer_snapshot as { name?: string } | null)?.name ?? null,
    })),
  });
}
