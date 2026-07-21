"use client";

import NumberFlow from "@number-flow/react";

// Animated AED figure (LIBRARIES_GUIDE §2.2). Digits roll with JetBrains
// Mono tabular numerals; the value is fils (integer) formatted to 2 decimals
// with thousands grouping — byte-identical to lib/money.ts formatAed for
// non-negative amounts, which is all we animate (totals, balances).
//
// The value is bound directly to `fils`, so the server-rendered / first-paint
// figure is the REAL amount (an earlier version started at 0 and rolled up on
// mount, which flashed "AED 0.00" until hydration — wrong on an FTA figure).
// NumberFlow still animates old → new whenever `fils` changes in place (e.g. a
// payment lands and the outstanding figure updates), and respects prefers-
// reduced-motion automatically — reduced-motion users just see the value.
export function AedFlow({ fils, className }: { fils: number; className?: string }) {
  return (
    <NumberFlow
      value={fils / 100}
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
