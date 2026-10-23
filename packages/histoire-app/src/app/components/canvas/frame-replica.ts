import type { HistoireSession } from '@histoire/sdk'
import { delegateHistoireStoryLinks, getAcceptedHistoireSessionDescriptor } from '@histoire/sdk/internal'
import { createStandaloneSession } from '../../standalone/session.js'

/** Reuse source/runtime adapters with isolated passive selection, state and events. */
export function createCanvasReplicaSession(canonical: HistoireSession, previewBase: string, options: {
  /** Matrix flag belongs to isolated runtime mount; source URL stays strict. */
  matrix?: boolean
  /** Native Single documents retain browser scrolling inside fixed dimensions. */
  nativeScroll?: boolean
} = {}): HistoireSession {
  const original = getAcceptedHistoireSessionDescriptor(canonical)
  const replica = createStandaloneSession({ url: previewBase, matrix: options.matrix, nativeScroll: options.nativeScroll, loadDescriptor: async () => original, subscribe(listener) {
    const initial = canonical.getSnapshot()
    let generationStatus = initial.status
    let generationSource = initial.source
    return canonical.subscribe((snapshot) => {
      // Source snapshots are replaced for every accepted catalog publication.
      // Avoid calling the detached cross-copy fallback on unrelated state changes.
      if (snapshot.status === generationStatus && snapshot.source === generationSource) return
      generationStatus = snapshot.status
      generationSource = snapshot.source
      if (snapshot.status !== 'ready' || !snapshot.source) {
        listener(null)
      }
      else {
        listener(getAcceptedHistoireSessionDescriptor(canonical))
      }
    })
  } })
  // Inspector docs bind to the selected replica; their story links must move the workbench.
  delegateHistoireStoryLinks(replica, canonical)
  return replica
}
