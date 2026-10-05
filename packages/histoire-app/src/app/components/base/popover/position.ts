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

/** Clamp a floating panel to both surface and browser bounds. */
export function positionPopover(anchor: DOMRect, bounds: PopoverBounds, viewport: { width: number, height: number }, desiredWidth: number) {
  const leftEdge = Math.max(8, bounds.left + 8)
  const rightEdge = Math.max(leftEdge + 1, Math.min(viewport.width - 8, bounds.right - 8))
  const topEdge = Math.max(8, bounds.top + 8)
  const bottomEdge = Math.max(topEdge + 1, Math.min(viewport.height - 8, bounds.bottom - 8))
  const width = Math.min(desiredWidth, rightEdge - leftEdge)
  const left = Math.max(leftEdge, Math.min(anchor.left + anchor.width / 2 - width / 2, rightEdge - width))
  const top = Math.max(topEdge, Math.min(anchor.bottom + 6, bottomEdge - 40))
  return { left, top, width, maxHeight: Math.max(1, bottomEdge - top) }
}
