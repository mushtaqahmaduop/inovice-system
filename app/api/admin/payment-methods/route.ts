import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { paymentMethodCreateSchema } from "@/lib/validation/settings";

// Create a payment method (task 3.2, D-25/R-2): admin edits rows instead of
// anyone migrating a CHECK constraint. Rows are never deleted — payments FK
// them — only deactivated via the [id] route.
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = paymentMethodCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .insert({ label: parsed.data.label, position: parsed.data.position })
    .select("id")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500; // unique(label)
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
