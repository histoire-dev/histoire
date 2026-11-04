/** Width and height in CSS pixels. */
export interface Size {
  /** Width. */
  width: number
  /** Height. */
  height: number
}

/** Image placement: zoom factor and top-left corner in container pixels. */
export interface ImageView {
  /** Zoom factor. */
  scale: number
  /** Left edge of the image. */
  x: number
  /** Top edge of the image. */
  y: number
}

/** Smallest zoom factor. */
export const MIN_SCALE = 0.05
/** Largest zoom factor. */
export const MAX_SCALE = 16
/** Zoom multiplier of one zoom button press or `+` key. */
export const ZOOM_STEP = 1.25
/** Keyboard pan distance in pixels. */
const PAN_STEP = 40
/** Keyboard pan distance with Shift held. */
const PAN_STEP_LARGE = 200

/**
 * Places the image at `scale`, centered in the container, then shifted by `offset`.
 * @param container Viewer size.
 * @param image Natural image size.
 * @param scale Zoom factor.
 * @param offset Shift from the centered position; positive moves right and down.
 */
export function centeredView(container: Size, image: Size, scale: number, offset: readonly [number, number] = [0, 0]): ImageView {
  return {
    scale,
    x: (container.width - image.width * scale) / 2 + offset[0],
    y: (container.height - image.height * scale) / 2 + offset[1],
  }
}

/**
 * Shows the whole image centered, then shifted by `offset`; small images keep their natural size.
 * @param container Viewer size.
 * @param image Natural image size.
 * @param offset Shift from the centered position; positive moves right and down.
 */
export function fitView(container: Size, image: Size, offset?: readonly [number, number]): ImageView {
  const scale = Math.min(1, container.width / image.width, container.height / image.height)
  return centeredView(container, image, scale > 0 && Number.isFinite(scale) ? scale : 1, offset)
}

/**
 * Zooms by `factor` around `point` (container pixels): the image pixel under it stays put.
 * @param view Current placement.
 * @param factor Zoom multiplier.
 * @param point Zoom origin in container pixels.
 * @param point.x Horizontal position.
 * @param point.y Vertical position.
 */
export function zoomAt(view: ImageView, factor: number, point: { x: number, y: number }): ImageView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
  const ratio = scale / view.scale
  return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }
}

/** View change requested from the keyboard. */
export type KeyCommand = { pan: [number, number] } | { zoom: number } | 'fit'

/** Image shift per arrow key; arrows reveal the side they point to, so the image moves the other way. */
const PAN_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/**
 * Maps a key press in the image viewer to a view change: arrows pan (Shift for a bigger step),
 * `+`/`=` and `-`/`_` zoom, `0` fits. Presses with Ctrl, Meta or Alt are left to the browser.
 * @param event Key press.
 * @param event.key Pressed key value.
 * @param event.shiftKey Shift held.
 * @param event.ctrlKey Ctrl held.
 * @param event.metaKey Meta held.
 * @param event.altKey Alt held.
 */
export function keyCommand(event: { key: string, shiftKey: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }): KeyCommand | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const direction = PAN_DIRECTIONS[event.key]
  if (direction) {
    const step = event.shiftKey ? PAN_STEP_LARGE : PAN_STEP
    // `+ 0` turns `-0` into `0` so callers and tests compare plain numbers.
    return { pan: [direction[0] * step + 0, direction[1] * step + 0] }
  }
  if (event.key === '+' || event.key === '=') return { zoom: ZOOM_STEP }
  if (event.key === '-' || event.key === '_') return { zoom: 1 / ZOOM_STEP }
  if (event.key === '0') return 'fit'
}
