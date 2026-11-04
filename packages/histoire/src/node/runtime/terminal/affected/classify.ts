import type { EvidenceIndex } from './evidence-index.js'
import type { AffectedChange } from './types.js'
import { isIgnoredEvent, isSourceModule } from '../../../test/eligibility/evidence.js'

/** What the selector knows beyond the index about stories it may not exclude. */
export interface UnprovenState {
  /** Stories whose retained graph is outdated by an event not yet re-analyzed. */
  stale: ReadonlySet<string>
  /** Every retained graph is outdated (structural event not yet re-analyzed). */
  all: boolean
}

/** Classification before the selector stamps order onto it. */
export type Classification = Omit<AffectedChange, 'seq'>

/**
 * Decides which stories one file event affects, from the retained index only.
 *
 * Rules, in order: graph members select their owners (plus anything that
 * cannot be excluded); paths the existing watcher rules ignore select nothing;
 * edits of source modules outside every graph select only unproven stories;
 * everything else (add/unlink, config and data files) may change resolution
 * anywhere and selects the whole scope. An index that never completed, or an
 * outdated one, proves nothing.
 * @param index Last complete evidence.
 * @param unproven Outdated graphs.
 * @param root Project root for the shared ignored-path rule.
 * @param event Chokidar event name.
 * @param file Absolute changed path.
 */
export function classifyFileEvent(index: EvidenceIndex, unproven: UnprovenState, root: string, event: string, file: string): Classification {
  const base = { event, file }
  const owners = new Set([...index.owners.get(file) ?? [], ...index.storyFiles.get(file) ?? []])
  if (!owners.size && isIgnoredEvent(root, file)) return { ...base, reason: 'ignored', storyIds: [], proven: [], whole: false, conservative: false }
  // Nothing is proven: a first or outdated analysis cannot exclude any story.
  if (!index.known || unproven.all) return { ...base, reason: index.known ? 'structural' : 'unresolved', storyIds: [], proven: [], whole: true, conservative: true }
  // Stories with no trusted graph can never be excluded by a non-ignored event.
  const unexcludable = new Set([...index.unresolved, ...unproven.stale])
  if (owners.size) {
    const ids = new Set([...owners, ...unexcludable])
    return { ...base, reason: ownerReason(index, owners), storyIds: [...ids], proven: [...owners], whole: false, conservative: ids.size > owners.size }
  }
  // Content edits of modules outside every graph cannot move any proved graph.
  if (event === 'change' && isSourceModule(file)) {
    return unexcludable.size
      ? { ...base, reason: 'unresolved', storyIds: [...unexcludable], proven: [], whole: false, conservative: true }
      : { ...base, reason: 'independent', storyIds: [], proven: [], whole: false, conservative: false }
  }
  return { ...base, reason: 'structural', storyIds: [], proven: [], whole: true, conservative: true }
}

/** `setup` when every proved story owns the file, `shared` for several owners, otherwise `story`. */
function ownerReason(index: EvidenceIndex, owners: ReadonlySet<string>): 'setup' | 'shared' | 'story' {
  if (owners.size < 2) return 'story'
  return owners.size >= index.stories.size ? 'setup' : 'shared'
}
