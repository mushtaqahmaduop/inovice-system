import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { paymentMethodUpdateSchema } from "@/lib/validation/settings";

// Update a payment method (rename / activate / deactivate / reorder).
// No DELETE — payments reference methods forever; deactivate instead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = paymentMethodUpdateSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;
  if (parsed.data.position !== undefined) update.position = parsed.data.position;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
