import { requireAdminAal2 } from "@/lib/auth/guards";
import { ExportForms } from "./export-forms";

// CSV exports (task 6.2) — admin only. The downloads stream from
// /api/export/[kind]; money is 2-decimal AED from integer math (D-18).
export default async function ExportsPage() {
  await requireAdminAal2();
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <p className="mono mb-1 text-[10px] tracking-[0.14em] text-ink-3 uppercase">
        Admin · Exports
      </p>
      <h1 className="mb-2 text-[15px] font-medium tracking-tight text-ink">CSV exports</h1>
      <p className="mb-6 text-[12px] leading-relaxed text-ink-3">
        Sealed and voided documents only — drafts carry no financials. Amounts are exact
        2-decimal AED. The VAT file is the report <em>basis</em>; the accountant&apos;s answers
        (V-register) finalize the return format.
      </p>
      <ExportForms />
    </div>
  );
}
