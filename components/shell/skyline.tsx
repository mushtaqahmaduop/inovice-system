// Decorative Dubai skyline for the auth screens (owner mockup 2026-07-30).
// Inline SVG on purpose: no external asset, no extra request, scales to any
// width, and inherits currentColor so it works in both themes. Purely
// ornamental, so aria-hidden and no title.
//
// Stylised, not architectural — an abstract sail-shape and a stepped spire
// read as "Dubai" without pretending to be a survey drawing.
export function Skyline({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 240"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* low-rise left */}
      <path d="M0 240 V196 h46 v-26 h40 v26 h34 v44" />
      <path d="M62 196 v44 M86 170 v70" />
      {/* sail tower */}
      <path d="M150 240 C150 150 196 96 236 78 C226 132 232 196 240 240 Z" />
      <path d="M236 78 V240 M186 190 h50 M198 158 h38" />
      {/* mid cluster */}
      <path d="M268 240 V150 h34 v90 M302 168 h30 v72" />
      <path d="M346 240 V128 l24 -20 l24 20 v112 Z" />
      <path d="M370 108 V240" />
      {/* stepped spire */}
      <path d="M470 240 V128 h20 V96 h16 V56 h10 V18 h6 V56 h10 v40 h16 v32 h20 v112 Z" />
      <path d="M522 18 V240 M490 128 h64 M506 96 h32" />
      {/* twin towers */}
      <path d="M588 240 V140 h30 v100 M626 240 V162 h30 v78" />
      <path d="M588 168 h30 M626 190 h30" />
      {/* domed block */}
      <path d="M700 240 V186 c0 -26 20 -44 44 -44 s44 18 44 44 v54 Z" />
      <path d="M744 142 V240 M700 200 h88" />
      {/* right cluster */}
      <path d="M820 240 V158 h26 v82 M856 240 V132 h26 v108" />
      <path d="M900 240 V176 l22 -18 l22 18 v64 Z" />
      <path d="M922 158 V240" />
      <path d="M968 240 V148 h34 v92 M1012 240 V180 h30 v60" />
      <path d="M968 180 h34" />
      {/* low-rise right */}
      <path d="M1060 240 V196 h44 v-22 h38 v22 h58 v44" />
      <path d="M1104 196 v44 M1142 174 v66" />
      {/* ground line */}
      <path d="M0 239.25 H1200" strokeWidth="1" />
    </svg>
  );
}
