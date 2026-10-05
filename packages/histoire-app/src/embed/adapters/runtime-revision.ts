import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'

/** Runtime lifetime uses explicit canonical content equality, never metadata guesses. */
export function createRuntimeRevisionOwner() {
  let epoch: string | undefined
  let revision: string | undefined
  let runtimeRevision: string | undefined

  /** Read only the selected actor's canonical executable digest. */
  function digest(snapshot: ReturnType<HistoireSession['getSnapshot']>, target: HistoireTarget) {
    return snapshot.catalog.stories.find(story => story.id === target.storyId)?.runtimeRevision
  }

  return {
    /** Capture before navigation so boot messages belong to one source generation. */
    capture(snapshot: ReturnType<HistoireSession['getSnapshot']>, target: HistoireTarget) {
      epoch = snapshot.source?.epoch
      revision = snapshot.source?.revision
      runtimeRevision = digest(snapshot, target)
    },
    /** Equal explicit digests rebind unrelated source revisions without remounting the iframe. */
    changed(snapshot: ReturnType<HistoireSession['getSnapshot']>, target: HistoireTarget) {
      if (epoch !== snapshot.source?.epoch) return true
      const nextDigest = digest(snapshot, target)
      if (revision === snapshot.source?.revision) return runtimeRevision !== nextDigest
      if (!runtimeRevision || !nextDigest || runtimeRevision !== nextDigest) return true
      revision = snapshot.source?.revision
      return false
    },
  }
}
