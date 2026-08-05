import type { Context } from '../context.js'
import { isAbsolute, normalize, relative } from 'pathe'

/**
 * Builds a getter for the ids under which the current story files can appear as
 * a Vite importer.
 *
 * Deliberately a getter and not a frozen set: the dev watcher keeps discovering
 * story files after server start, and a set frozen at startup would hand
 * late-added files the node-oriented `vitest` entry (which breaks in the
 * browser) whenever their name does not match the `.story.*` fallback (custom
 * storyMatch patterns). Only consulted when an importer requests the bare
 * `vitest` id, so the rebuild cost is negligible.
 * @param ctx The histoire context.
 */
export function createStoryImporterIdsGetter(ctx: Context) {
  return () => new Set(ctx.storyFiles.flatMap((file) => {
    return [
      file.relativePath,
      file.path,
      file.moduleId,
      toRootRelativeStoryImporterId(file.path, ctx.root),
      toRootRelativeStoryImporterId(file.moduleId, ctx.root),
    ]
      .filter((value): value is string => !!value && !value.startsWith('\0'))
      .map(normalizeStoryImporterId)
  }))
}

/**
 * Matches story importers across raw file paths, root-relative ids, and Vite's
 * normalized `/@fs/...?vue` Vue SFC submodule ids.
 * @param importer The importer id reported by Vite.
 * @param storyImporterIds Known story ids (see {@link createStoryImporterIdsGetter}).
 * @param root The project root.
 */
export function isStoryVitestImporter(importer: string | undefined, storyImporterIds: Set<string>, root: string) {
  if (!importer) {
    return false
  }

  for (const candidate of getStoryVitestImporterCandidates(importer, root)) {
    if (storyImporterIds.has(candidate) || /\.story\.[^/]+$/.test(candidate)) {
      return true
    }
  }

  return false
}

/**
 * Lists every form an importer id can take when compared against story ids.
 */
function getStoryVitestImporterCandidates(importer: string, root: string) {
  const normalized = normalizeStoryImporterId(importer)
  const result = new Set<string>([normalized])
  const withoutLeadingSlash = normalized.replace(/^\/+/, '')

  if (withoutLeadingSlash && withoutLeadingSlash !== normalized) {
    result.add(withoutLeadingSlash)
  }

  const rootRelative = toRootRelativeStoryImporterId(normalized, root)
  if (rootRelative) {
    result.add(rootRelative)
    result.add(rootRelative.slice(1))
  }

  return result
}

/**
 * Strips the Vite query suffix and the `/@fs` prefix from an importer id.
 */
function normalizeStoryImporterId(value: string) {
  const id = value.split('?')[0]
  return normalize(id.startsWith('/@fs/') ? id.slice(4) : id)
}

/**
 * Converts an absolute path inside the project into its root-relative id.
 * @returns `null` when the value is not an absolute path under the root.
 */
function toRootRelativeStoryImporterId(value: string | undefined, root: string) {
  if (!value) {
    return null
  }

  const normalizedValue = normalize(value)
  const normalizedRoot = normalize(root)

  if (!isAbsolute(normalizedValue)
    || (normalizedValue !== normalizedRoot && !normalizedValue.startsWith(`${normalizedRoot}/`))) {
    return null
  }

  return `/${relative(normalizedRoot, normalizedValue)}`
}
