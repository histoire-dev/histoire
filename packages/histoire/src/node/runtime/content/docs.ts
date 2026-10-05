import type { ContentReader, StoryContentEntry } from './types.js'
import { CatalogError } from '../catalog/types.js'
import { readCurrentContent, readSourceContent } from './source.js'

/** Validates preferred captured docs and source before returning original body. */
export async function readDocsContent(root: string, entry: StoryContentEntry, readText?: ContentReader) {
  const docs = entry.docs
  if (!docs) {
    if (entry.docsUnavailableCode === 'PATH_OUTSIDE_ROOT') throw new CatalogError('PATH_OUTSIDE_ROOT', 'Registered documentation is outside project root')
    throw new CatalogError('DOCS_NOT_FOUND', 'Story documentation is unavailable')
  }
  if (docs.absolutePath) await readCurrentContent(root, docs.registeredPath ?? docs.absolutePath, docs.absolutePath, docs.physicalSha256, readText)
  else if (docs.origin === 'collected' && entry.source.kind === 'file') await readSourceContent(root, entry.source, readText)
  return docs
}
