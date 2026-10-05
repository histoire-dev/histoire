import type { HistoireSession } from '@histoire/sdk'
import { getHistoireSessionDescriptor } from '@histoire/sdk/internal'
import { createStandaloneSession } from '../../standalone/session.js'

/** Reuse source/runtime adapters with isolated passive selection, state and events. */
export function createCanvasReplicaSession(canonical: HistoireSession, previewBase: string, options: {
  /** Matrix flag belongs to isolated runtime mount; source URL stays strict. */
  matrix?: boolean
} = {}): HistoireSession {
  const original = getHistoireSessionDescriptor(canonical)
  return createStandaloneSession({ url: previewBase, matrix: options.matrix, loadDescriptor: async () => original, subscribe(listener) {
    const initial = canonical.getSnapshot()
    let generation = JSON.stringify([initial.status, initial.source])
    return canonical.subscribe((snapshot) => {
      const current = JSON.stringify([snapshot.status, snapshot.source])
      if (current === generation) return
      generation = current
      if (snapshot.status !== 'ready' || !snapshot.source) {
        listener(null)
      }
      else {
        const descriptor = getHistoireSessionDescriptor(canonical)
        listener(descriptor)
      }
    })
  } })
}
