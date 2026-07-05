import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { customerInputSchema } from "@/lib/validation/customer";

// Create customer (task 3.1). Staff and admin may create (RLS matrix §5) —
// the walk-in quick path posts here too with just {type:'walk_in', name}.
// Always the caller's RLS-scoped client; identity from the session only.
export async function POST(request: Request) {
  const guard = await requireUserApi();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = customerInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      type: parsed.data.type,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      trn: parsed.data.trn,
      address: parsed.data.address,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
