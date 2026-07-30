import Image from "next/image";

// The Prestige Land brand mark — the owner's supplied "PL" monogram
// (public/brand/pl-monogram.jpg, provided 2026-07-30), shared by the app shell
// and the auth screens so there is exactly ONE mark for the product.
//
// The supplied file is a 350×350 JPEG with a BAKED-IN WHITE BACKGROUND, so it
// cannot sit directly on the navy shell — it would show as a white square. It is
// therefore framed in a deliberate white tile, which reads as intentional on
// both the navy sidebar and the light auth card.
//
// TO UPGRADE (worth doing before go-live): supply the mark as SVG, or a
// transparent PNG at ≥1000px. That would allow the navy-on-gold treatment from
// the owner's mockup, and — more importantly — a crisp mark on the PRINTED
// invoice, where 350px is only ~30mm at 300dpi. `settings.logo_path` and the
// placeholder block in components/invoice/invoice-doc.tsx are already waiting
// for it.
export function BrandMark({
  className = "size-9 shrink-0",
  /** rendered pixel size — keep ≥ the CSS size so the raster stays crisp */
  size = 72,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`overflow-hidden rounded-[10px] border border-black/10 bg-white ${className}`}
      aria-hidden="true"
    >
      <Image
        src="/brand/pl-monogram.jpg"
        alt=""
        width={size}
        height={size}
        className="size-full object-contain p-0.5"
        priority
      />
    </span>
  );
}
