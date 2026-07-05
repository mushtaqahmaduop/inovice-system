import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi, requireAdminApi } from "@/lib/auth/api-guards";
import { createClient } from "@/lib/supabase/server";
import { customerUpdateSchema } from "@/lib/validation/customer";

// Customer mutations (task 3.1). CLAUDE.md §4: soft delete only — there is
// no DELETE handler here and never will be. RLS enforces the matrix; the
// role checks below only produce clean 403s instead of empty updates.
// - update       staff + admin (non-deleted rows — RLS blocks deleted ones)
// - soft_delete  admin only (aal2, same bar as every admin mutation)
// - restore      admin only

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), data: customerUpdateSchema }),
  z.object({ action: z.literal("soft_delete") }),
  z.object({ action: z.literal("restore") }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (parsed.data.action === "update") {
    const guard = await requireUserApi();
    if (guard.error) return guard.error;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .update(parsed.data.data)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // soft_delete / restore — admin only.
  const guard = await requireAdminApi();
  if (guard.error) return guard.error;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ deleted_at: parsed.data.action === "soft_delete" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
