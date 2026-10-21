import type { PreviewRuntimeStoryFile } from './preamble.js'
import { createHash } from 'node:crypto'
import { buildStoryModuleLoader } from './story-module-loader.js'

/**
 * Prefix of the per-story entry modules the dev preview runtime imports. Each
 * entry carries one story's metadata and module loader, so a sandbox document
 * only receives the story it shows instead of every collected story.
 */
export const PREVIEW_STORY_ENTRY_ID_PREFIX = 'virtual:$histoire-preview-story:'

/** Resolved form of {@link PREVIEW_STORY_ENTRY_ID_PREFIX}. */
export const RESOLVED_PREVIEW_STORY_ENTRY_ID_PREFIX = `\0${PREVIEW_STORY_ENTRY_ID_PREFIX}`

/**
 * Import specifier of a story's entry module.
 *
 * The `v` query hashes everything the entry emits. Vite serves versioned URLs
 * immutable, so unchanged stories are read from the browser cache by every
 * later sandbox document; a collection that changes the story regenerates the
 * runtime with a new URL instead of needing to invalidate the entry.
 * @param file Story metadata.
 * @param hmr Whether the entry emits the hot-update loader form.
 * @param salt Changes every version, so entries transformed by another run's
 * plugins (e.g. a different Vitest mocker setup) are never reused.
 */
export function getStoryEntrySpecifier(file: PreviewRuntimeStoryFile, hmr: boolean, salt = ''): string {
  const version = createHash('sha1').update(JSON.stringify([file, hmr, salt])).digest('hex').slice(0, 10)
  return `${PREVIEW_STORY_ENTRY_ID_PREFIX}${encodeURIComponent(file.id)}?v=hst-${version}`
}

/**
 * Story id encoded in a (resolved) entry module id.
 * @param id Resolved module id, starting with {@link RESOLVED_PREVIEW_STORY_ENTRY_ID_PREFIX}.
 */
export function parseStoryEntryId(id: string): string {
  const encoded = id.slice(RESOLVED_PREVIEW_STORY_ENTRY_ID_PREFIX.length).split('?')[0]
  return decodeURIComponent(encoded)
}

/**
 * Emitted `"<story id>": () => import("<entry specifier>")` entries, one per
 * story. Literal specifiers let Vite resolve and rewrite them like any import.
 * @param files Story files to emit an entry loader for.
 * @param hmr Whether entries emit the hot-update loader form.
 * @param salt Version salt (see {@link getStoryEntrySpecifier}).
 */
export function buildStoryEntryLoaders(files: PreviewRuntimeStoryFile[], hmr: boolean, salt = ''): string[] {
  return files.map(file => `${JSON.stringify(file.id)}: () => import(${JSON.stringify(getStoryEntrySpecifier(file, hmr, salt))})`)
}

/**
 * Source of a story entry module: its metadata as `file` and its module
 * loader as `load`, both `null` for a story the collection does not know.
 * @param file Story metadata, `undefined` when unknown.
 * @param options Loader options.
 * @param options.hmr Whether `load` takes the cache-busting version argument.
 */
export function buildStoryEntryModule(file: PreviewRuntimeStoryFile | undefined, { hmr }: { hmr: boolean }): string {
  if (!file) return 'export const file = null\nexport const load = null\n'
  return `export const file = ${JSON.stringify(file)}\nexport const load = ${buildStoryModuleLoader(file, { hmr })}\n`
}

/**
 * Emits the runtime side of lazy story entries: the entry loader table and
 * `loadStoryEntry`, which imports a story's entry once and registers it in
 * the `files` / `moduleLoaders` tables the variant test session reads.
 * @param entryLoaders Emitted entry loader entries.
 */
export function previewStoryEntries(entryLoaders: string[]): string {
  return `const storyEntryLoaders = {
  ${entryLoaders.join(',\n  ')}
}
const storyEntryRequests = new Map()

/** Imports a story's entry module once; a failed import can be retried. */
function loadStoryEntry(storyId) {
  if (!Object.hasOwn(storyEntryLoaders, storyId) || files.some(file => file.id === storyId)) return Promise.resolve()
  let request = storyEntryRequests.get(storyId)
  if (!request) {
    request = storyEntryLoaders[storyId]().then((entry) => {
      if (entry.file && !files.some(file => file.id === storyId)) {
        files.push(entry.file)
        moduleLoaders[storyId] = entry.load
      }
    }, (error) => {
      storyEntryRequests.delete(storyId)
      throw error
    })
    storyEntryRequests.set(storyId, request)
  }
  return request
}`
}
