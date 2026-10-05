import type { ContentReader, SourceContentEntry } from './types.js'
import { readStorySource } from '../../story-source.js'
import { CatalogError } from '../catalog/types.js'
import { CatalogContentChangedError, readRegisteredText, RegisteredContentError } from './files.js'
import { hashContent } from './hash.js'

/** Reads only captured registered identity/hash; stale reads never adopt newer bytes. */
export async function readCurrentContent(root: string, path: string, expectedPath: string, sha256: string, readText?: ContentReader): Promise<string> {
  try {
    const current = await (readText ? readText(root, path) : readRegisteredText(undefined, path))
    if (current.sha256 !== sha256 || current.identity.absolutePath !== expectedPath) throw new CatalogError('STALE_REVISION', 'Registered content changed since catalog publication', true)
    return current.text
  }
  catch (error) {
    if (error instanceof CatalogError) throw error
    if (error instanceof RegisteredContentError && error.code === 'PATH_OUTSIDE_ROOT') throw new CatalogError(error.code, error.message)
    if (error instanceof CatalogContentChangedError || error instanceof RegisteredContentError) throw new CatalogError('STALE_REVISION', 'Registered content is unavailable since catalog publication', true)
    throw new CatalogError('SOURCE_UNAVAILABLE', 'Registered content cannot be read')
  }
}

/** Shared physical/virtual selection, preserving original Source panel bytes. */
export async function readSourceContent(root: string, source: SourceContentEntry, readText?: ContentReader): Promise<string> {
  if (source.kind === 'unavailable') throw new CatalogError(source.unavailableCode ?? 'SOURCE_UNAVAILABLE', 'Registered source is unavailable')
  const text = await readStorySource({ virtual: source.kind === 'virtual', moduleCode: source.text, path: source.registeredPath ?? source.absolutePath }, path => readCurrentContent(root, path, source.absolutePath, source.sha256, readText))
  if (text == null || hashContent(text) !== source.sha256) throw new CatalogError('STALE_REVISION', 'Registered source changed since catalog publication', true)
  return text
}
