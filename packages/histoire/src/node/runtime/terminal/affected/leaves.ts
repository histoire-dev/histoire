import type { EvidenceIndex } from './evidence-index.js'
import type { AffectedChange } from './types.js'

/** Verifier from the existing eligibility generation capture. */
export interface LeafVerifier {
  /** True while every unwatched leaf still has its recorded fingerprint. */
  verifyLeaves: (leaves: ReadonlyMap<string, string>) => Promise<boolean>
}

/**
 * Stories owning an unwatched leaf (installed package, plugin virtual module)
 * whose content changed or can no longer be fingerprinted. Unverifiable evidence
 * counts as changed, never as unchanged.
 * @param index Retained evidence.
 * @param verifier Shared per-operation fingerprint reader.
 */
export async function findChangedLeaves(index: EvidenceIndex, verifier: LeafVerifier): Promise<string[]> {
  const changed: string[] = []
  await Promise.all([...index.stories].filter(([, story]) => story.leaves.size).map(async ([id, story]) => {
    if (!await verifier.verifyLeaves(story.leaves)) changed.push(id)
  }))
  return changed
}

/**
 * Adds leaf owners to a classified change. A change that already selects
 * through a stronger reason keeps it.
 * @param change Classification of the triggering event.
 * @param leafStories Stories whose leaf changed.
 */
export function withLeafOwners(change: AffectedChange, leafStories: readonly string[]): AffectedChange {
  if (!leafStories.length) return change
  const ids = new Set([...change.storyIds, ...leafStories])
  const proven = new Set([...change.proven, ...leafStories])
  const selecting = change.whole || change.storyIds.length > 0
  return { ...change, reason: selecting ? change.reason : 'leaf', storyIds: [...ids], proven: [...proven] }
}
