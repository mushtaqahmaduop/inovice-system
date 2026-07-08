import { ChevronRight } from "lucide-react";
import { requireAdminAal2 } from "@/lib/auth/guards";
import { ExportForms } from "./export-forms";

// CSV exports (task 6.2) — admin only. The downloads stream from
// /api/export/[kind]; money is 2-decimal AED from integer math (D-18).
export default async function ExportsPage() {
  await requireAdminAal2();
  return (
    <div className="w-full px-5 py-6 md:px-8">
      <header className="mb-6 max-w-3xl">
        <nav className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-text-tertiary uppercase">
          <span>Admin</span>
          <ChevronRight className="size-3" />
          <span className="text-text-secondary">Exports</span>
        </nav>
        <h1 className="text-[22px] leading-7 font-semibold text-foreground">CSV exports</h1>
        <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
          Sealed and voided documents only — drafts carry no financials. Amounts are exact 2-decimal
          AED. The VAT file is the report <em>basis</em>; the accountant&apos;s answers (V-register)
          finalize the return format.
        </p>
      </header>
      <div className="max-w-3xl">
        <ExportForms />
      </div>
    </div>
  );
}
