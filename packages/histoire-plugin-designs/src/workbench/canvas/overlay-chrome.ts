import type { CanvasMode, OverlayPlacement } from './overlay-geometry.js'
import { getHistoireIcon } from '@histoire/shared/dist/icons/index.js'
import { element } from './design-element.js'
import { movePlacement, resizePlacement, setSplit } from './overlay-geometry.js'

/** Callbacks wiring the chrome to the canvas view. */
export interface OverlayChromeEvents {
  /** Current canvas zoom; converts pointer deltas into canvas units. */
  zoom: () => number
  /** Placement at gesture start. */
  current: () => OverlayPlacement | undefined
  /** Live placement while a gesture runs. */
  onChange: (placement: OverlayPlacement) => void
  /** Final placement once a gesture or key nudge ends; the view stores it. */
  onCommit: (placement: OverlayPlacement) => void
}

/** Outline, move and resize grips and split divider over a laid-over design. */
export interface OverlayChrome {
  /** Chrome element, placed once in the canvas layer above the variant frame. */
  node: HTMLElement
  /**
   * Places the chrome on the design box; the divider only shows in Split mode.
   * @param placement Design box.
   * @param mode Comparison mode (Overlay or Split).
   */
  render: (placement: OverlayPlacement, mode: CanvasMode) => void
}

/**
 * Applies a gesture or nudge to the placement it started from.
 * @param start Placement at gesture start.
 * @param dx Horizontal delta in canvas units.
 * @param dy Vertical delta in canvas units.
 * @param alternate Shift held during a pointer gesture.
 */
type Apply = (start: OverlayPlacement, dx: number, dy: number, alternate: boolean) => OverlayPlacement

/**
 * Creates a handle element showing a bundled glyph.
 * @param className Class attribute.
 * @param label Accessible name.
 * @param icon Bundled glyph name; omitted handles are drawn by CSS.
 */
function handle(className: string, label: string, icon?: string): HTMLElement {
  const node = element('div', className)
  node.tabIndex = 0
  node.setAttribute('role', 'button')
  node.setAttribute('aria-label', label)
  node.title = label
  const glyph = icon ? getHistoireIcon(icon) : undefined
  if (glyph) {
    // Bundled offline glyph data, never user content.
    node.innerHTML = `<svg viewBox="0 0 ${glyph.width ?? 32} ${glyph.height ?? 32}" width="14" height="14" aria-hidden="true">${glyph.body}</svg>`
  }
  return node
}

/**
 * Creates the overlay chrome. Pointer gestures capture the pointer, so moving over the story
 * frame never interrupts them; arrow keys nudge (Shift for bigger steps).
 * @param events View callbacks.
 */
export function createOverlayChrome(events: OverlayChromeEvents): OverlayChrome {
  const node = element('div', 'histoire-designs-overlay-chrome')
  const move = handle('histoire-designs-overlay-grip histoire-designs-overlay-move', 'Move design', 'move')
  const resize = handle('histoire-designs-overlay-grip histoire-designs-overlay-resize', 'Resize design')
  const divider = element('div', 'histoire-designs-overlay-divider')
  const knob = handle('histoire-designs-overlay-grip histoire-designs-overlay-knob', 'Split position', 'arrows-horizontal')
  knob.setAttribute('role', 'slider')
  knob.setAttribute('aria-orientation', 'horizontal')
  knob.setAttribute('aria-valuemin', '0')
  knob.setAttribute('aria-valuemax', '100')
  divider.append(knob)
  node.append(move, resize, divider)

  /**
   * Makes a handle draggable and keyboard adjustable.
   * @param target Handle element.
   * @param apply Placement update.
   * @param keyStep Canvas units of one arrow key press.
   */
  function bind(target: HTMLElement, apply: Apply, keyStep: (start: OverlayPlacement) => number): void {
    target.addEventListener('pointerdown', (down) => {
      const start = events.current()
      if (down.button !== 0 || !start) return
      // No text selection or native drag while the grip moves.
      down.preventDefault()
      target.setPointerCapture(down.pointerId)
      let last = start
      const moveListener = (event: PointerEvent) => {
        const zoom = events.zoom()
        last = apply(start, (event.clientX - down.clientX) / zoom, (event.clientY - down.clientY) / zoom, event.shiftKey)
        events.onChange(last)
      }
      const end = () => {
        target.removeEventListener('pointermove', moveListener)
        target.removeEventListener('lostpointercapture', end)
        events.onCommit(last)
      }
      target.addEventListener('pointermove', moveListener)
      target.addEventListener('lostpointercapture', end)
    })
    target.addEventListener('keydown', (event) => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      const start = events.current()
      if (!direction || !start) return
      event.preventDefault()
      const step = keyStep(start) * (event.shiftKey ? 10 : 1)
      events.onCommit(apply(start, direction[0] * step, direction[1] * step, false))
    })
  }

  bind(move, (start, dx, dy) => movePlacement(start, dx, dy), () => 1)
  // Proportions stay unless Shift is held, so a design never distorts by accident.
  bind(resize, (start, dx, dy, alternate) => resizePlacement(start, dx, dy, !alternate), () => 1)
  bind(knob, (start, dx) => setSplit(start, start.x + start.split * start.width + dx), start => start.width / 100)

  return {
    node,
    render(placement, mode) {
      Object.assign(node.style, { left: `${placement.x}px`, top: `${placement.y}px`, width: `${placement.width}px`, height: `${placement.height}px` })
      divider.hidden = mode !== 'split'
      divider.style.left = `${placement.split * 100}%`
      knob.setAttribute('aria-valuenow', String(Math.round(placement.split * 100)))
    },
  }
}
