import type { CollectionEvidence } from '../../../test/eligibility/evidence.js'

/** Detached graph membership of one proved story. */
export interface IndexedStory {
  /** Watched files of the story and setup graphs. */
  files: ReadonlySet<string>
  /** Unwatched leaves and their recorded fingerprints. */
  leaves: ReadonlyMap<string, string>
}

/** Story file as the context registered it when the index was built. */
export interface IndexedStoryFile {
  /** Absolute registered path. */
  path: string
  /** Story ID collected from that file. */
  storyId: string
}

/**
 * Last complete evidence of a scope, copied out of the eligibility service so
 * its invalidation can never erase it. Replaced only by a successful analysis.
 */
export interface EvidenceIndex {
  /** False before the first successful analysis: nothing may be excluded. */
  known: boolean
  /** Proved stories by exact ID. */
  stories: ReadonlyMap<string, IndexedStory>
  /** Graph file to the exact story IDs whose graph contains it. */
  owners: ReadonlyMap<string, ReadonlySet<string>>
  /** Registered story file to story IDs, for stories without proof as well. */
  storyFiles: ReadonlyMap<string, readonly string[]>
  /** Collected stories whose graph was not fully observed. */
  unresolved: ReadonlySet<string>
}

/** The index of a selector that has not analyzed anything yet. */
export const EMPTY_INDEX: EvidenceIndex = { known: false, stories: new Map(), owners: new Map(), storyFiles: new Map(), unresolved: new Set() }

/**
 * Builds a detached index from a finished analysis.
 * @param storyFiles Collected story files the analysis covered.
 * @param evidence Per-story evidence of that analysis; absent stories become unresolved.
 */
export function buildEvidenceIndex(storyFiles: readonly IndexedStoryFile[], evidence: ReadonlyMap<string, CollectionEvidence>): EvidenceIndex {
  const stories = new Map<string, IndexedStory>()
  const owners = new Map<string, Set<string>>()
  for (const [storyId, proof] of evidence) {
    stories.set(storyId, { files: new Set(proof.files), leaves: new Map(proof.leaves) })
    for (const file of proof.files) {
      let set = owners.get(file)
      if (!set) owners.set(file, set = new Set())
      set.add(storyId)
    }
  }
  const byFile = new Map<string, string[]>()
  const unresolved = new Set<string>()
  for (const { path, storyId } of storyFiles) {
    byFile.set(path, [...byFile.get(path) ?? [], storyId])
    if (!stories.has(storyId)) unresolved.add(storyId)
  }
  return { known: true, stories, owners, storyFiles: byFile, unresolved }
}
