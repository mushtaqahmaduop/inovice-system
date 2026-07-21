"use client";

import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

// Animated AED figure (LIBRARIES_GUIDE §2.2). Digits roll with JetBrains
// Mono tabular numerals; the value is fils (integer) formatted to 2 decimals
// with thousands grouping — byte-identical to lib/money.ts formatAed for
// non-negative amounts, which is all we animate (totals, balances).
//
// On mount it rolls up from 0 → value (the premium load-in the owner asked to
// keep); thereafter it animates old → new whenever `fils` changes in place
// (e.g. a payment lands and the outstanding figure updates). The visible
// figure starts at 0 for one frame before the roll; the aria-label always
// carries the REAL amount so screen readers and no-JS never see the 0.
// NumberFlow respects prefers-reduced-motion automatically — reduced-motion
// users just see the final value with no roll.
export function AedFlow({ fils, className }: { fils: number; className?: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => setValue(fils / 100), [fils]);

  return (
    <NumberFlow
      value={value}
      locales="en-US"
      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      className={className}
      aria-label={formatFallback(fils)}
    />
  );
}

// Pre-hydration / a11y label mirrors formatAed so screen readers and the
// no-JS render read the real figure, not the 0 the animation starts from.
function formatFallback(fils: number): string {
  const neg = fils < 0;
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}.${String(abs % 100).padStart(2, "0")}`;
}
