import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { serviceCreateSchema } from "@/lib/validation/service";

// Create a catalogue service (task 3.3, [#25]). Admin-only (RLS §5:
// services are staff-read, admin-write). Fees arrive as integer fils.
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null);
  const parsed = serviceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      name: parsed.data.name,
      unit: parsed.data.unit,
      govt_fee: parsed.data.govtFee,
      service_fee: parsed.data.serviceFee,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
