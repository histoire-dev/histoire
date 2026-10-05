import type { CatalogSnapshot, CatalogStory } from './types.js'
import { Buffer } from 'node:buffer'
import { CatalogError } from './types.js'

/** Preserves exact valid IDs while rejecting malformed/oversized values. */
export function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.isWellFormed() && Buffer.byteLength(value) <= 1024
}

/** Allows registered relative labels without serializing absolute private paths. */
export function validRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.isWellFormed() && !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') && !/^[A-Z]:/i.test(value)
}

/** Checks the explicit collection projection before publication. */
export function validStory(value: CatalogStory): boolean {
  return validId(value.id) && validRelativePath(value.filePath) && typeof value.title === 'string' && typeof value.supportPluginId === 'string'
    && Array.isArray(value.treePath) && value.treePath.every(part => typeof part === 'string') && Array.isArray(value.variants) && value.variants.every(variant => validId(variant.id) && typeof variant.title === 'string')
}

/** Resolves exact target identity and never silently chooses duplicate records. */
export function lookupStory(snapshot: CatalogSnapshot, storyId: string, expectedRevision?: string) {
  if (!snapshot) throw new CatalogError('PROJECT_STARTING', 'Project catalog is starting', true)
  if (expectedRevision && expectedRevision !== snapshot.revision) throw new CatalogError('STALE_REVISION', 'Catalog revision changed', true)
  const matches = snapshot.stories.filter(story => story.id === storyId)
  if (matches.length > 1) throw new CatalogError('STORY_AMBIGUOUS', 'Story ID is ambiguous', false, { storyId })
  if (!matches.length) throw new CatalogError(snapshot.failed ? 'COLLECTION_FAILED' : 'STORY_NOT_FOUND', snapshot.failed ? 'Story collection failed' : 'Story not found', snapshot.failed, { storyId })
  return { projectId: snapshot.projectId, revision: snapshot.revision, story: matches[0] }
}

/** Validates exact scoped variant identity against the completed catalog. */
export function lookupTarget(snapshot: CatalogSnapshot, storyId: string, variantId: string, expectedRevision?: string) {
  const result = lookupStory(snapshot, storyId, expectedRevision)
  const matches = result.story.variants.filter(variant => variant.id === variantId)
  if (matches.length > 1) throw new CatalogError('STORY_AMBIGUOUS', 'Variant ID is ambiguous within story', false, { storyId, variantId })
  if (!matches.length || result.story.docsOnly) throw new CatalogError('VARIANT_NOT_FOUND', 'Variant not found', false, { storyId, variantId })
  return { ...result, variant: matches[0] }
}
