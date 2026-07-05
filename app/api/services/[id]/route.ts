import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { serviceUpdateSchema } from "@/lib/validation/service";

// Service mutations (task 3.3): update fields / deactivate (is_active=false,
// hides from the 4.1b picker but stays visible in the catalogue) /
// soft_delete + restore (removed from the catalogue view). No hard DELETE —
// issued invoices were priced off these rows (CLAUDE.md §4).

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), data: serviceUpdateSchema }),
  z.object({ action: z.literal("soft_delete") }),
  z.object({ action: z.literal("restore") }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  let update: Record<string, unknown>;
  if (parsed.data.action === "update") {
    const d = parsed.data.data;
    if (Object.keys(d).length === 0) {
      return NextResponse.json({ error: "Empty update" }, { status: 400 });
    }
    update = {};
    if (d.name !== undefined) update.name = d.name;
    if (d.unit !== undefined) update.unit = d.unit;
    if (d.govtFee !== undefined) update.govt_fee = d.govtFee;
    if (d.serviceFee !== undefined) update.service_fee = d.serviceFee;
    if (d.isActive !== undefined) update.is_active = d.isActive;
  } else {
    update = {
      deleted_at: parsed.data.action === "soft_delete" ? new Date().toISOString() : null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
