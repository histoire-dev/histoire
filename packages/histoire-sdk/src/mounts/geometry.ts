import type { HistoireViewport } from '@histoire/protocol'
import type { HistoireSessionNotification } from '../adapters/types.js'
import { intersectRuntimeRects, mapRuntimeViewport } from '@histoire/protocol'

/** Map validated source-local layout into mount padding box and all host scroll clips. */
export function createMountGeometry(iframe: HTMLIFrameElement, container: HTMLElement, publish: (notification: HistoireSessionNotification) => void) {
  let last: Extract<HistoireSessionNotification, { type: 'layout' }> | undefined
  let active = true
  let scheduled = 0
  const window = container.ownerDocument.defaultView!
  /** Geometry never queries child DOM; cross-origin surface has same behavior. */
  function project(value: Extract<HistoireSessionNotification, { type: 'layout' }>) {
    const frame = iframe.getBoundingClientRect()
    const mount = container.getBoundingClientRect()
    const offset = { x: mount.x + container.clientLeft * (container.offsetWidth ? mount.width / container.offsetWidth : 1), y: mount.y + container.clientTop * (container.offsetHeight ? mount.height / container.offsetHeight : 1) }
    let clip = intersectRuntimeRects(frame, { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
    for (let parent: HTMLElement | null = container; parent && clip; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent)
      const x = /auto|scroll|hidden|clip/.test(style.overflowX)
      const y = /auto|scroll|hidden|clip/.test(style.overflowY)
      if (x || y) {
        const rect = parent.getBoundingClientRect()
        const scaleX = parent.offsetWidth ? rect.width / parent.offsetWidth : 1
        const scaleY = parent.offsetHeight ? rect.height / parent.offsetHeight : 1
        clip = intersectRuntimeRects(clip, { x: x ? rect.x + parent.clientLeft * scaleX : clip.x, y: y ? rect.y + parent.clientTop * scaleY : clip.y, width: x ? parent.clientWidth * scaleX : clip.width, height: y ? parent.clientHeight * scaleY : clip.height })
      }
    }
    const viewports = clip && iframe.clientWidth && iframe.clientHeight ? value.viewports.map(viewport => mapRuntimeViewport(viewport, { x: frame.x - offset.x, y: frame.y - offset.y, width: frame.width, height: frame.height }, { width: iframe.clientWidth, height: iframe.clientHeight }, { ...clip, x: clip.x - offset.x, y: clip.y - offset.y })).filter((value): value is HistoireViewport => value !== null) : []
    return { ...value, viewports }
  }
  /** Coalesced host scrolling/resize refresh retained source geometry under same captured owner. */
  function refresh() {
    if (!active || scheduled || !last) return
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0
      if (active && last) publish(project(last))
    })
  }
  const resize = new ResizeObserver(refresh)
  resize.observe(container)
  resize.observe(iframe)
  window.addEventListener('resize', refresh)
  container.ownerDocument.addEventListener('scroll', refresh, true)
  return {
    /** Runtime change clears cache; late host scroll cannot publish predecessor positions. */
    receive(notification: HistoireSessionNotification): HistoireSessionNotification {
      if (notification.type === 'runtime') {
        last = notification.runtime.status === 'ready' ? { ...notification, type: 'layout', viewports: notification.runtime.viewports } : undefined
        if (!last) return notification
        const viewports = project(last).viewports
        const viewport = viewports.find(viewport => viewport.target.storyId === notification.runtime.viewport?.target.storyId && viewport.target.variantId === notification.runtime.viewport.target.variantId) ?? null
        return { ...notification, runtime: { ...notification.runtime, viewports, viewport } }
      }
      if (notification.type !== 'layout') return notification
      last = notification
      return project(notification)
    },
    /** Remove observers/listeners before mount ownership release. */
    close() {
      active = false
      last = undefined
      window.cancelAnimationFrame(scheduled)
      resize.disconnect()
      window.removeEventListener('resize', refresh)
      container.ownerDocument.removeEventListener('scroll', refresh, true)
    },
  }
}
