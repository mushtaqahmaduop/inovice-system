// The Prestige Land brand mark — a navy rounded tile with a gold three-peak
// crown over a "PL" monogram (literal brand colours, placeholder until the
// owner's real logo asset lands). Shared so the app shell and the auth screens
// show the SAME mark; an earlier login page carried a different hexagon glyph,
// which read as two logos for one product.
export function BrandMark({ className = "size-9 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#16233f" />
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        fill="none"
        stroke="#2a3c63"
        strokeWidth="1"
      />
      {/* three-peak crown */}
      <path
        d="M12.5 17.5 L12.5 12 L16.25 15 L20 10.5 L23.75 15 L27.5 12 L27.5 17.5 Z"
        fill="#d9a441"
      />
      {/* PL monogram */}
      <text
        x="20"
        y="32"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        fontWeight="700"
        letterSpacing="-1.5"
        fill="#d9a441"
      >
        PL
      </text>
    </svg>
  );
}
