import { BRAND_PATH, BRAND_VIEWBOX } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * Digital Amenities isotype (the DA monogram), inlined so it inherits the
 * current text color instead of shipping a fixed-color raster.
 * El path vive en lib/brand.ts: el recibo en PDF lo necesita tambien.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${BRAND_VIEWBOX.width} ${BRAND_VIEWBOX.height}`}
      className={cn('h-full w-auto', className)}
      fill="currentColor"
      stroke="currentColor"
      strokeMiterlimit={10}
      role="img"
      aria-label="Digital Amenities"
    >
      <path d={BRAND_PATH} />
    </svg>
  )
}
