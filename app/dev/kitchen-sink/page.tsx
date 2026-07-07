"use client";

// Kitchen sink (PREMIUM_EXECUTION_GUIDE §1.2 step 2) — every primitive in
// every state, both themes. This route is the contract for all later
// slices; if a state looks wrong here it will look wrong everywhere.

import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SelectNative } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";
import { Card, StatTile } from "@/components/ui/card";
import { FieldLabel, FieldHint, FieldError } from "@/components/ui/field";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function KitchenSinkPage() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [seg, setSeg] = useState<"all" | "draft" | "issued" | "paid" | "overdue">("all");

  return (
    <div className="mx-auto max-w-[1040px] px-8 py-10">
      <p className="text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
        Redesign slice 2 · primitive contract
      </p>
      <h1 className="serif mt-1 text-[26px] leading-8 font-semibold">Kitchen sink</h1>
      <p className="mt-1 max-w-[64ch] text-[15px] leading-[23px] text-text-secondary">
        Every primitive, every state. Tab through it — focus rings are part of the contract.
      </p>

      <Section title="Buttons §5.1 — variants × states">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Issue invoice</Button>
          <Button variant="outline">Save draft</Button>
          <Button variant="ghost">Keep editing</Button>
          <Button variant="destructive">Void invoice</Button>
          <Button variant="link">View ledger</Button>
          <Button variant="ghost" size="icon" aria-label="Print" title="Print">
            <Printer />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled>Issue invoice</Button>
          <Button variant="outline" disabled>
            Save draft
          </Button>
          <Button size="sm">Record payment</Button>
          <Button variant="outline" size="sm">
            Reverse
          </Button>
          <Button size="sm" disabled>
            Saving…
          </Button>
        </div>
      </Section>

      <Section title="Inputs & forms §5.2">
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ks-name">Customer name</FieldLabel>
            <FieldHint>Shown on the printed invoice.</FieldHint>
            <Input id="ks-name" className="mt-1.5" placeholder="Prestige Land Typing Center" />
          </div>
          <div>
            <FieldLabel htmlFor="ks-amount">Amount</FieldLabel>
            <FieldHint>Two decimals maximum.</FieldHint>
            <div className="relative mt-1.5">
              <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-text-tertiary">
                AED
              </span>
              <Input
                id="ks-amount"
                inputMode="decimal"
                className="mono pl-12 text-right"
                defaultValue="1,250.00"
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="ks-err">TRN</FieldLabel>
            <Input id="ks-err" aria-invalid className="mt-1.5" defaultValue="12 digits" />
            <FieldError>TRN must be 15 digits</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="ks-method">Payment method</FieldLabel>
            <SelectNative id="ks-method" className="mt-1.5">
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>Card</option>
            </SelectNative>
          </div>
          <div>
            <FieldLabel htmlFor="ks-dis">Disabled</FieldLabel>
            <Input id="ks-dis" disabled className="mt-1.5" value="Locked at issue" readOnly />
          </div>
        </div>
      </Section>

      <Section title="Switch §5.3 · Segmented §5.4">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-3">
            <Switch checked={on} onCheckedChange={setOn} aria-label="VAT registered" />
            <span className="text-[15px]">VAT registered</span>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={off} onCheckedChange={setOff} aria-label="Off state" />
            <span className="text-[15px] text-text-secondary">Send reminders</span>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked disabled onCheckedChange={() => {}} aria-label="Disabled" />
            <span className="text-[15px] text-text-tertiary">Disabled</span>
          </div>
          <Segmented
            aria-label="Invoice status filter"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "issued", label: "Issued" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue" },
            ]}
          />
        </div>
      </Section>

      <Section title="Status badges §2.3 — soft bg + strong text, never filled">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusChip variant="neutral">Draft</StatusChip>
          <StatusChip variant="ink">· Sealed ·</StatusChip>
          <StatusChip variant="success">Paid · sealed</StatusChip>
          <StatusChip variant="warning">Partially paid</StatusChip>
          <StatusChip variant="warning-filled">Overdue</StatusChip>
          <StatusChip variant="neutral">Walk-in</StatusChip>
        </div>
      </Section>

      <Section title="Cards & stat tiles §5.6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Outstanding — who owes us"
            prefix="AED"
            value="42,180.00"
            trend="12.4%"
            trendDirection="down"
            sub="vs last month"
          />
          <StatTile
            label="Collected this month"
            prefix="AED"
            value="10,500.00"
            trend="8.2%"
            trendDirection="up"
            sub="vs last month"
          />
          <Card>
            <p className="text-[18px] leading-[26px] font-semibold">Plain card</p>
            <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
              Hairline border, radius 12, no shadow — separation by whitespace.
            </p>
            <Button size="sm" className="mt-4">
              One primary per region
            </Button>
          </Card>
        </div>
      </Section>

      <Section title="Empty state §5.9">
        <Card className="flex flex-col items-center py-12 text-center">
          <FileText aria-hidden="true" className="size-10 text-text-tertiary" strokeWidth={1.75} />
          <p className="serif mt-3 text-[18px] leading-[26px] font-semibold">No invoices yet</p>
          <p className="mt-1 max-w-[36ch] text-[13px] leading-[19px] text-text-secondary">
            Create your first one — it takes about a minute at the counter.
          </p>
          <Button className="mt-5">Create invoice</Button>
        </Card>
      </Section>
    </div>
  );
}
