/** One host layout publication: dedupe key plus the post it stands for. */
export interface RuntimeLayoutPublication {
  /** Serialized runtime, target and mapped viewports. */
  key: string
  /** Post the publication to the host bridge. */
  post: () => void
}

/**
 * Coalesce runtime frame geometry reads into one per animation frame and skip
 * `layout.changed` posts whose content matches the last one.
 */
export function createRuntimeLayoutScheduler(iframe: HTMLIFrameElement, options: {
  /** Live runtime document able to publish layout. */
  active: () => boolean
  /** Read geometry (forces layout) and describe the resulting publication. */
  measure: () => RuntimeLayoutPublication | undefined
}) {
  let scheduled = 0
  let published: string | undefined

  /** Schedule one geometry read; bursts within a frame share it. */
  function refresh(): void {
    if (!options.active() || scheduled) return
    scheduled = requestAnimationFrame(() => {
      scheduled = 0
      if (!options.active()) return
      const next = options.measure()
      if (!next || next.key === published) return
      published = next.key
      next.post()
    })
  }

  /** Only scrolling the document or an ancestor of the frame can move it on screen. */
  function scroll(event: Event): void {
    const target = event.target
    if (target instanceof Node && !target.contains(iframe)) return
    refresh()
  }

  window.addEventListener('resize', refresh)
  iframe.ownerDocument.addEventListener('scroll', scroll, true)
  return {
    refresh,
    /** Readiness publications carry viewports too, so the next layout must post again. */
    reset(): void {
      published = undefined
    },
    /** Release listeners and any scheduled read. */
    close(): void {
      window.removeEventListener('resize', refresh)
      iframe.ownerDocument.removeEventListener('scroll', scroll, true)
      cancelAnimationFrame(scheduled)
      scheduled = 0
    },
  }
}
