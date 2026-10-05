import type { usePointerPan } from './pan/usePointerPan.js'
import type { useSpacePan } from './pan/useSpacePan.js'

/** Same-origin sandbox events do not bubble across iframe document boundary. */
export function bindCanvasFrameInteractions(root: HTMLElement, pointer: ReturnType<typeof usePointerPan>, space: ReturnType<typeof useSpacePan>, wheel: (event: WheelEvent) => void) {
  const cleanups = new Map<HTMLIFrameElement, () => void>()

  /** Map iframe CSS pixels into parent browser pixels before pan/zoom math. */
  function mapPointer(event: PointerEvent, iframe: HTMLIFrameElement): PointerEvent {
    const rect = iframe.getBoundingClientRect()
    return { pointerId: event.pointerId, button: event.button, currentTarget: root, clientX: rect.left + event.clientX * rect.width / iframe.clientWidth, clientY: rect.top + event.clientY * rect.height / iframe.clientHeight, preventDefault: () => event.preventDefault() } as unknown as PointerEvent
  }

  /** Attach only accessible same-origin documents; each navigation drops old listeners. */
  function attach(iframe: HTMLIFrameElement) {
    let removeDocument = () => {}
    /** Iframe load replaces Document while preserving WindowProxy and DOM element. */
    function loaded() {
      removeDocument()
      let document: Document | null = null
      try {
        document = iframe.contentDocument
      }
      catch { return }
      if (!document) return
      const down = (event: PointerEvent) => pointer.onPointerDown(mapPointer(event, iframe))
      const move = (event: PointerEvent) => pointer.onPointerMove(mapPointer(event, iframe))
      const up = (event: PointerEvent) => pointer.onPointerUp(mapPointer(event, iframe))
      const scroll = (event: WheelEvent) => {
        const rect = iframe.getBoundingClientRect()
        wheel({ deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey, metaKey: event.metaKey, clientX: rect.left + event.clientX * rect.width / iframe.clientWidth, clientY: rect.top + event.clientY * rect.height / iframe.clientHeight, preventDefault: () => event.preventDefault() } as WheelEvent)
      }
      document.addEventListener('pointerdown', down, true)
      document.addEventListener('pointermove', move, true)
      document.addEventListener('pointerup', up, true)
      document.addEventListener('wheel', scroll, { capture: true, passive: false })
      document.addEventListener('keydown', space.onKeyDown, true)
      document.addEventListener('keyup', space.onKeyUp, true)
      document.addEventListener('focusin', space.onFocusIn, true)
      removeDocument = () => {
        document?.removeEventListener('pointerdown', down, true)
        document?.removeEventListener('pointermove', move, true)
        document?.removeEventListener('pointerup', up, true)
        document?.removeEventListener('wheel', scroll, true)
        document?.removeEventListener('keydown', space.onKeyDown, true)
        document?.removeEventListener('keyup', space.onKeyUp, true)
        document?.removeEventListener('focusin', space.onFocusIn, true)
      }
    }
    iframe.addEventListener('load', loaded)
    loaded()
    cleanups.set(iframe, () => {
      iframe.removeEventListener('load', loaded)
      removeDocument()
    })
  }

  /** Reconcile runtime adapter's actual iframes after mount/unmount, including passive cells. */
  function synchronize() {
    for (const [iframe, cleanup] of cleanups) {
      if (!root.contains(iframe)) {
        cleanup()
        cleanups.delete(iframe)
      }
    }
    for (const iframe of root.querySelectorAll('iframe')) {
      if (!cleanups.has(iframe)) attach(iframe)
    }
  }
  const observer = new MutationObserver(synchronize)
  observer.observe(root, { childList: true, subtree: true })
  synchronize()
  return () => {
    observer.disconnect()
    for (const cleanup of cleanups.values()) cleanup()
    cleanups.clear()
  }
}
