/** Visible viewport-coordinate bounds supplied by an owning surface. */
export interface PopoverBounds {
  /** First horizontal edge. */
  left: number
  /** First vertical edge. */
  top: number
  /** Last horizontal edge, excluding reserved inspector space. */
  right: number
  /** Last vertical edge. */
  bottom: number
}

/** Lazy bounds let surface adapters read fresh coordinates after scrolling. */
export type PopoverBoundary = PopoverBounds | (() => PopoverBounds)

/** Reserve surface chrome on its logical end without mutating caller geometry. */
export function reservePopoverInlineEnd(bounds: PopoverBounds, width: number, direction: string): PopoverBounds {
  return direction === 'rtl'
    ? { ...bounds, left: Math.min(bounds.right, bounds.left + width) }
    : { ...bounds, right: Math.max(bounds.left, bounds.right - width) }
}

/** Optional placement hints for {@link positionPopover}. */
export interface PopoverPlacement {
  /** Rendered panel height; lets the panel open above a trigger with too little room below. */
  height?: number
  /** Horizontal alignment to the trigger; defaults to centered. */
  align?: 'center' | 'start'
  /** Preferred side; the other side is used when the panel only fits there. Defaults to below. */
  side?: 'bottom' | 'top'
}

/** Clamp a floating panel to both surface and browser bounds, opening above when it fits better. */
export function positionPopover(anchor: DOMRect, bounds: PopoverBounds, viewport: { width: number, height: number }, desiredWidth: number, placement: PopoverPlacement = {}) {
  const leftEdge = Math.max(8, bounds.left + 8)
  const rightEdge = Math.max(leftEdge + 1, Math.min(viewport.width - 8, bounds.right - 8))
  const topEdge = Math.max(8, bounds.top + 8)
  const bottomEdge = Math.max(topEdge + 1, Math.min(viewport.height - 8, bounds.bottom - 8))
  const width = Math.min(desiredWidth, rightEdge - leftEdge)
  const preferred = placement.align === 'start' ? anchor.left : anchor.left + anchor.width / 2 - width / 2
  const left = Math.max(leftEdge, Math.min(preferred, rightEdge - width))
  const below = bottomEdge - anchor.bottom - 6
  const above = anchor.top - 6 - topEdge
  const height = placement.height
  // Open on the preferred side when the panel fits there; otherwise take the roomier side.
  const fitsAbove = height !== undefined && height <= above
  const fitsBelow = height === undefined || height <= below
  const openAbove = placement.side === 'top' ? fitsAbove || (!fitsBelow && above > below) : !fitsBelow && above > below
  if (height !== undefined && openAbove) {
    return { left, top: Math.max(topEdge, anchor.top - 6 - height), width, maxHeight: Math.max(1, above) }
  }
  const top = Math.max(topEdge, Math.min(anchor.bottom + 6, bottomEdge - 40))
  return { left, top, width, maxHeight: Math.max(1, bottomEdge - top) }
}
