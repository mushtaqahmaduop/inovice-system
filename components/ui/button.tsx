import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Buttons per DESIGN_SYSTEM_CLAUDE_BLUE §5.1 — full pills, 5 designed
// states (default/hover/focus-visible/pressed/disabled), pressed adds
// scale(0.98). Variant names kept from shadcn so call sites don't churn:
// default = Primary pill, outline = Secondary, ghost = Ghost,
// destructive = danger-family secondary (solid red only inside confirms).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-[15px] font-[550] whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-on-accent hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]",
        outline: "border-border-strong bg-transparent text-foreground hover:bg-bg-sunken",
        secondary: "border-border-strong bg-transparent text-foreground hover:bg-bg-sunken",
        ghost: "text-foreground hover:bg-bg-sunken",
        destructive:
          "border-danger/50 bg-transparent text-danger hover:bg-danger-soft focus-visible:ring-danger/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[38px] gap-2 px-[18px]",
        xs: "h-7 gap-1 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5",
        icon: "size-[34px] rounded-[8px]",
        "icon-xs": "size-6 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[8px]",
        "icon-lg": "size-9 rounded-[8px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
