import { requireAdminAal2 } from "@/lib/auth/guards";
import { ExportForms } from "./export-forms";

// CSV exports (task 6.2) — admin only. The downloads stream from
// /api/export/[kind]; money is 2-decimal AED from integer math (D-18).
export default async function ExportsPage() {
  await requireAdminAal2();
  return (
    <div className="w-full px-5 py-6 md:px-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-[22px] leading-7 font-semibold text-foreground">Exports</h1>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Sealed and voided documents only — drafts carry no financials. Amounts are exact 2-decimal
          AED. The VAT file is the report <em>basis</em>; the accountant&apos;s answers (V-register)
          finalize the return format.
        </p>
      </header>
      <div className="max-w-2xl">
        <ExportForms />
      </div>
    </div>
  );
}
