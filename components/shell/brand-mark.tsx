// Prestige Land brand mark — the hexagon P-L monogram (owner's logo asset,
// p-l-logo-design). Rebuilt as inline SVG so it stays crisp at every size
// and in both themes. The P is the hero letter: a real stem + bowl (with its
// counter punched out) in light blue; the L is the navy foot at the base of
// the shared stem. Inside a bright-blue hexagon ring. The blues are
// intentionally literal brand colors, not design tokens (same exception as
// the print document and the MFA QR). One component so the sidebar and the
// login screen never drift apart.

const HEX_BLUE = "#2E9BD6";
const PL_NAVY = "#173A6B";

export function BrandMark({ className = "size-9 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* hexagon ring */}
      <polygon
        points="50,6 88,28 88,72 50,94 12,72 12,28"
        fill="none"
        stroke={HEX_BLUE}
        strokeWidth="7"
        strokeLinejoin="round"
      />
      {/* P — stem + bowl, with the counter punched out (evenodd) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={HEX_BLUE}
        d="M36 27 H55 A14 14 0 0 1 55 55 H46 V71 H36 Z M46 37 H54 A5.5 5.5 0 0 1 54 45 H46 Z"
      />
      {/* L — navy foot at the base of the shared stem */}
      <path d="M36 61 H66 V71 H36 Z" fill={PL_NAVY} />
    </svg>
  );
}
