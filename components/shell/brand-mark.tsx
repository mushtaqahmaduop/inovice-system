// Prestige Land brand mark — the hexagon P-L monogram (owner's logo asset,
// p-l-logo-design). Rebuilt as inline SVG so it stays crisp at every size
// and in both themes: a shared vertical stem carries the P's triangular bowl
// (light blue) at the top and the L's foot (navy) at the bottom, inside a
// bright-blue hexagon ring. The blues are intentionally literal brand colors,
// not design tokens (same exception as the print document and the MFA QR).
// One component so the sidebar and the login screen never drift apart.

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
        strokeWidth="7.5"
        strokeLinejoin="round"
      />
      {/* shared vertical stem (the L, navy) */}
      <rect x="40" y="29" width="9.5" height="43" fill={PL_NAVY} />
      {/* the L foot */}
      <path d="M40 62.5 H67 V72 H40 Z" fill={PL_NAVY} />
      {/* the P bowl (light blue triangle off the stem) */}
      <path d="M49.5 30 L69 40.5 L49.5 51 Z" fill={HEX_BLUE} />
    </svg>
  );
}
