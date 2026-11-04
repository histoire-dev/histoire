import type { TestTarget } from '@histoire/cli/protocol/tests'
import type { CatalogSnapshot, CatalogStory } from '../../catalog/types.js'
import type { AffectedChange, AffectedSelection } from './types.js'
import { relative } from 'pathe'
import { AFFECTED_REASON_ORDER, isAffecting } from './types.js'

/** Result with nothing selected. */
function empty(status: AffectedSelection['status'], missing: string[] = [], revision?: string): AffectedSelection {
  return { status, storyIds: [], targets: [], reason: 'independent', reasons: [], conservative: false, missing, revision }
}

/**
 * Intersects classified changes with an exact test scope against the current
 * completed catalog. A scope is never broadened: a story or variant that the
 * catalog no longer has stays an explicit `missing` state, and a variant scope
 * keeps its variant. Story IDs are compared as whole strings, never joined.
 * @param snapshot Current completed catalog, if any.
 * @param root Project root; maps changed files to catalog-relative story files.
 * @param scope Exact all/story/variant target.
 * @param changes Classified changes accumulated since the last run.
 */
export function selectAffected(snapshot: CatalogSnapshot | undefined, root: string, scope: TestTarget, changes: readonly AffectedChange[]): AffectedSelection {
  if (!snapshot) return empty('unavailable')
  const runnable = snapshot.stories.filter(story => !story.docsOnly)
  let inScope: CatalogStory[]
  if (scope.scope === 'all') {
    inScope = runnable
  }
  else {
    const story = runnable.find(candidate => candidate.id === scope.storyId)
    const variant = scope.scope === 'variant' ? story?.variants.find(candidate => candidate.id === scope.variantId) : true
    if (!story || !variant) return empty('missing', [scope.storyId], snapshot.revision)
    inScope = [story]
  }
  const affecting = changes.filter(isAffecting)
  const whole = affecting.some(change => change.whole)
  const ids = new Set(affecting.flatMap(change => change.storyIds))
  // A story file edit may now register different IDs than the retained graph knew.
  const files = new Set(affecting.map(change => relative(root, change.file)))
  const picked = inScope.filter(story => whole || ids.has(story.id) || files.has(story.filePath))
  // Proof of a story: a non-whole change whose graph contains the file, or the story's own file.
  const proven = new Set(affecting.filter(change => !change.whole).flatMap(change => change.proven))
  const provenFiles = new Set(affecting.filter(change => !change.whole && change.reason !== 'unresolved').map(change => relative(root, change.file)))
  const reasons = AFFECTED_REASON_ORDER.filter(reason => picked.length > 0 && affecting.some(change => change.reason === reason))
  return {
    status: 'ok',
    storyIds: picked.map(story => story.id),
    targets: picked.map(story => scope.scope === 'variant' ? scope : { scope: 'story', storyId: story.id }),
    reason: reasons[0] ?? 'independent',
    reasons,
    conservative: picked.some(story => !(proven.has(story.id) || provenFiles.has(story.filePath))),
    missing: [],
    revision: snapshot.revision,
  }
}
