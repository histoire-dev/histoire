import type { HistoireSelectionInput, HistoireSourceIdentity, HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireResource } from '@histoire/vue/internal'

/** Captured source and selected document for deferred page feedback. */
export interface PageOwner {
  /** Exact completed source publication. */
  source: HistoireSourceIdentity | null
  /** Exact canonical selection, including story-only documents. */
  selection: HistoireTarget | null
}

/** Target-only identities never authorize completion against a newer source publication. */
export function samePageOwner(owner: PageOwner, current: PageOwner): boolean {
  return owner.source?.sourceId === current.source?.sourceId && owner.source?.epoch === current.source?.epoch && owner.source?.revision === current.source?.revision
    && (owner.selection ? getHistoireTargetKey(owner.selection) : null) === (current.selection ? getHistoireTargetKey(current.selection) : null)
}

/** Shared page lifetime and canonical-selection guard keeps async completions attributable. */
export function usePageOwnership(session: HistoireSession) {
  let active = true
  useHistoireResource(() => {
    active = false
  })
  /** Capture current completed source and document without retaining reactive references. */
  function capture(): PageOwner {
    const value = session.getSnapshot()
    return { source: value.source, selection: value.selection }
  }
  /** Only live page, exact source and exact document can publish UI feedback. */
  function owns(owner: PageOwner): boolean {
    const value = session.getSnapshot()
    return active && value.status === 'ready' && !value.stale && samePageOwner(owner, value)
  }
  /** Await SDK facade selection, then notify only while its synchronously accepted target survives. */
  async function select(input: HistoireSelectionInput, notify: (target: HistoireTarget) => void, error: (value: unknown) => void): Promise<void> {
    let owner = capture()
    try {
      const operation = session.selection.select(input)
      owner = { source: owner.source, selection: session.getSnapshot().selection }
      await operation
      if (owns(owner) && owner.selection?.storyId === input.storyId && (input.variantId === undefined || owner.selection.variantId === input.variantId)) notify(owner.selection)
    }
    catch (failure) { if (owns(owner)) error(failure) }
  }
  return { capture, owns, select }
}
