/** Pixel size of a visual image or of the pane showing it. */
export interface VisualSize {
  width: number
  height: number
}

/** Smallest zoom reachable from viewer controls. */
export const MIN_VISUAL_ZOOM = 0.05
/** Largest zoom reachable from viewer controls. */
export const MAX_VISUAL_ZOOM = 4

/** Keep zoom within viewer control bounds. */
export function clampVisualZoom(zoom: number): number {
  return Math.min(MAX_VISUAL_ZOOM, Math.max(MIN_VISUAL_ZOOM, zoom))
}

/**
 * Shared scale that makes every compared image fit inside one pane.
 * Automatic sizing passes `enlarge: false` so small screenshots stay crisp at natural size.
 */
export function fitVisualZoom(pane: VisualSize, images: VisualSize[], enlarge: boolean): number | undefined {
  if (!pane.width || !pane.height || !images.length) {
    return undefined
  }
  const width = Math.max(...images.map(size => size.width))
  const height = Math.max(...images.map(size => size.height))
  // Round down so subpixel layout never makes a fitted image overflow and show scrollbars.
  const zoom = Math.floor(Math.min(pane.width / width, pane.height / height) * 1000) / 1000
  return clampVisualZoom(enlarge ? zoom : Math.min(1, zoom))
}
