// Federal-Blue hexagon + "PL" monogram — the app's brand mark. Still a
// placeholder pending the client's real logo file (DECISIONS.md Q-02,
// still open); this replaces the earlier navy/gold crown placeholder with
// a simpler mark that matches the design system's own accent instead of
// literal brand colors, so it stops looking like two different products.
export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={`${className} shrink-0`} aria-hidden="true">
      <polygon points="14,1.5 25.5,8 25.5,20 14,26.5 2.5,20 2.5,8" className="fill-primary" />
      <text
        x="14"
        y="18.5"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="10.5"
        fontWeight="700"
        letterSpacing="-0.3"
        fill="#ffffff"
      >
        PL
      </text>
    </svg>
  );
}
