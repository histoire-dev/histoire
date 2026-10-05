import type { HistoireBridgePublication } from '@histoire/protocol'
import { mapRuntimeViewport } from '@histoire/protocol'

/** Project source-local opaque anchors through outer frame without child DOM access. */
export function createMountOverlay(iframe: HTMLIFrameElement, publish: (event: HistoireBridgePublication) => void) {
  const window = iframe.ownerDocument.defaultView!
  let active = true
  let last: HistoireBridgePublication | undefined
  let scheduled = 0
  /** Only anchor rectangle is mapped; callback/value payload never crosses this boundary. */
  function project(event: HistoireBridgePublication): HistoireBridgePublication {
    const payload = event.payload as any
    if (!payload.anchor || !event.target) return event
    const rect = iframe.getBoundingClientRect()
    const mapped = mapRuntimeViewport({ ...payload.anchor, target: event.target, visibleRect: payload.anchor, scale: 1 }, rect, { width: iframe.clientWidth || 1, height: iframe.clientHeight || 1 }, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
    return mapped ? { ...event, payload: { ...payload, anchor: mapped.visibleRect } } : { ...event, event: 'overlay.close', payload: { id: payload.id } }
  }
  /** Host scrolling/resizing recomputes same captured document's retained anchor. */
  function refresh(): void {
    if (!active || !last || scheduled) return
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0
      if (active && last) publish(project({ ...last, event: 'overlay.update' }))
    })
  }
  const resize = new ResizeObserver(refresh)
  resize.observe(iframe)
  window.addEventListener('resize', refresh)
  iframe.ownerDocument.addEventListener('scroll', refresh, true)
  return {
    /** Replacing/closing overlays retires retained geometry before notification. */
    receive(event: HistoireBridgePublication): void {
      if (event.event === 'overlay.open' || event.event === 'overlay.update') last = event
      else if (event.event === 'overlay.close' || event.event === 'readiness.changed') last = undefined
      if (active) publish(project(event))
    },
    /** Parent result closes geometry immediately; stale refresh cannot reopen listbox. */
    clear(): void { last = undefined },
    /** Stop every host geometry callback before attachment disappears. */
    close(): void {
      active = false
      last = undefined
      window.cancelAnimationFrame(scheduled)
      resize.disconnect()
      window.removeEventListener('resize', refresh)
      iframe.ownerDocument.removeEventListener('scroll', refresh, true)
    },
  }
}
