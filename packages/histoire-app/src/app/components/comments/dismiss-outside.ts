import { onBeforeUnmount, onMounted } from 'vue'

/** Pointer travel (px) beyond which a press counts as a canvas pan, not a click. */
const CLICK_SLOP = 4
/** Elements whose clicks never minimize the open comment: the card, pins and canvas controls. */
const KEEP_OPEN = '.canvas-comment-overlay, .canvas-comment-pin, button, a, input, select, textarea, label, [role="menu"], [role="dialog"], [role="toolbar"], [tabindex]:not(.histoire-canvas-viewport)'

/**
 * Minimizes the open comment when the user clicks the canvas outside its card:
 * a press-and-release without panning on the canvas viewport, or focus moving
 * into a story iframe (iframe clicks never reach the parent document).
 * @param dismiss Called when an outside click is detected.
 */
export function useDismissOnOutsideClick(dismiss: () => void): void {
  let press: { x: number, y: number } | undefined
  /** Remember canvas presses outside the card and pins. */
  function down(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null
    press = target?.closest('.histoire-canvas-viewport') && !target.closest(KEEP_OPEN) ? { x: event.clientX, y: event.clientY } : undefined
  }
  /** Releases near the press point are clicks; longer travel was a pan. */
  function up(event: PointerEvent) {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= CLICK_SLOP) dismiss()
    press = undefined
  }
  /** Window blur with an iframe focused means the click landed inside a story frame. */
  function blur() {
    // Focus moves to the iframe after blur fires.
    setTimeout(() => {
      const active = document.activeElement
      if (active instanceof HTMLIFrameElement && active.closest('.histoire-canvas-viewport')) dismiss()
    })
  }
  onMounted(() => {
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    window.addEventListener('blur', blur)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointerup', up, true)
    window.removeEventListener('blur', blur)
  })
}
