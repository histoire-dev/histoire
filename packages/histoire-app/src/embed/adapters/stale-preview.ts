import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'

/** Last rendered standalone content may remain visible while its actor loses all authority. */
export function createStalePreview(iframe: HTMLIFrameElement, standalone = false) {
  let retained = false
  let lastGood: { sourceId: string, target: HistoireTarget, relativePath?: string } | undefined
  const tabIndex = iframe.tabIndex

  /** Native inert prevents keyboard entry as well as pointer interaction with old content. */
  function suspend() {
    iframe.setAttribute('inert', '')
    iframe.setAttribute('aria-disabled', 'true')
    iframe.tabIndex = -1
    iframe.style.pointerEvents = 'none'
    iframe.blur()
  }

  /** Explicit docs/deselection and unrelated failures cannot retain a removed actor. */
  function retain(snapshot: ReturnType<HistoireSession['getSnapshot']>, target: HistoireTarget | null) {
    if (!standalone || snapshot.selection !== null || !lastGood || !target
      || lastGood.sourceId !== snapshot.source?.sourceId || target.storyId !== lastGood.target.storyId || target.variantId !== lastGood.target.variantId) {
      return false
    }
    const matchingFailure = snapshot.diagnostics.some(diagnostic => diagnostic.code === 'COLLECTION_FAILED' && diagnostic.severity === 'error'
      && (diagnostic.storyId === target.storyId || (lastGood.relativePath !== undefined && diagnostic.relativePath === lastGood.relativePath)))
    if (!matchingFailure) return false
    retained = true
    suspend()
    return true
  }

  return {
    /** Retained pixels never imply a valid runtime document. */
    get retained() { return retained },
    /** Capture metadata only after selected actor has actually rendered. */
    remember(snapshot: ReturnType<HistoireSession['getSnapshot']>, target: HistoireTarget) {
      const story = snapshot.catalog.stories.find(story => story.id === target.storyId)
      if (snapshot.source && story) lastGood = { sourceId: snapshot.source.sourceId, target: { ...target }, relativePath: story.relativePath }
    },
    retain,
    /** Replacement navigation restores input only after minting a fresh document owner. */
    restore() {
      retained = false
      lastGood = undefined
      iframe.removeAttribute('inert')
      iframe.removeAttribute('aria-disabled')
      iframe.tabIndex = tabIndex
      iframe.style.pointerEvents = ''
    },
    /** Source publication aborts tests before publishing diagnostics; inspect its settled snapshot. */
    retireAfterCancellation(getSnapshot: HistoireSession['getSnapshot'], target: HistoireTarget | null, active: () => boolean, finish: (keepFrame: boolean) => void) {
      suspend()
      queueMicrotask(() => {
        if (active()) finish(retain(getSnapshot(), target))
      })
    },
  }
}
