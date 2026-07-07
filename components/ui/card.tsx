import { cn } from "@/lib/utils";

// Cards & stat tiles per DESIGN_SYSTEM_CLAUDE_BLUE §5.6 — surface, 1px
// border, radius-md, 20px padding. NO shadow on page-level cards.
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-[12px] border border-border bg-surface p-5", className)}
      {...props}
    />
  );
}

// Stat tile: caption label → serif display number → quiet trend line.
// Trend colors: up = success, down = danger; the vs-text stays tertiary.
export function StatTile({
  label,
  value,
  prefix,
  trend,
  trendDirection,
  sub,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  prefix?: string;
  trend?: string;
  trendDirection?: "up" | "down";
  sub?: string;
  /** lg = the dashboard hero figure (display-xl); md = regular tile. */
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <Card className={className}>
      <p className="text-[12px] leading-4 font-medium tracking-[0.04em] text-text-tertiary uppercase">
        {label}
      </p>
      <p
        className={`serif mt-2 font-semibold text-foreground ${
          size === "lg" ? "text-[34px] leading-10" : "text-[22px] leading-7"
        }`}
      >
        {prefix ? (
          <span className="mr-1.5 align-middle text-[15px] font-normal text-text-tertiary">
            {prefix}
          </span>
        ) : null}
        <span className="mono tracking-tight">{value}</span>
      </p>
      {trend || sub ? (
        <p className="mono mt-1.5 text-[13px]">
          {trend ? (
            <span className={trendDirection === "down" ? "text-danger" : "text-success"}>
              {trendDirection === "down" ? "↓" : "↑"} {trend}
            </span>
          ) : null}
          {sub ? <span className="ml-1.5 text-text-tertiary">{sub}</span> : null}
        </p>
      ) : null}
    </Card>
  );
}
