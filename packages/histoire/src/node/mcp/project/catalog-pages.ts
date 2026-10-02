import type { McpDiagnostic } from '../protocol/project-schema.js'
import type { McpStory } from '../protocol/story-schema.js'
import { Buffer } from 'node:buffer'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { createCatalogCursors } from './cursors.js'

/** Shared finite filters over dev publications and immutable Node catalog. */
export interface CatalogListInput {
  /** Case-insensitive title/navigation/path substring. */
  query?: string
  /** Exact plugin identity. */
  supportPluginId?: string
  /** Exact collected group. */
  group?: string
  /** Bounded page count. */
  pageSize?: number
  /** Issued opaque continuation. */
  cursor?: string
}

/** Minimal completed metadata needed by transport-neutral catalog pagination. */
export interface CatalogPageSnapshot {
  /** Completed catalog publication. */
  revision: string
  /** Deterministically ordered allowlisted metadata. */
  stories: readonly McpStory[]
  /** Bounded collection diagnostics. */
  diagnostics: readonly McpDiagnostic[]
  /** Omitted additional diagnostics. */
  diagnosticsTruncated: boolean
}

/** Reuse filtering, byte bounds and issued cursor authority across runtime modes. */
export function createCatalogPager(options: { projectId: string, current: () => CatalogPageSnapshot, retained?: (revision: string) => CatalogPageSnapshot | undefined, updating: () => boolean, now?: () => number }) {
  const cursors = createCatalogCursors(options.projectId, options.now)
  return (input: CatalogListInput) => {
    let snapshot = options.current()
    const pageSize = input.pageSize ?? MCP_LIMITS.pageSize
    const query = input.query ?? ''
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MCP_LIMITS.maxPageSize || query.length > 256) throw new McpDomainError('INVALID_CURSOR', 'Invalid catalog paging parameters')
    const fingerprint = JSON.stringify([query, input.supportPluginId ?? null, input.group ?? null, pageSize])
    let offset = 0
    if (input.cursor) {
      const record = cursors.read(input.cursor, fingerprint)
      offset = record.offset
      if (record.revision !== snapshot.revision) {
        const retained = options.retained?.(record.revision)
        if (!retained) throw new McpDomainError('CURSOR_EXPIRED', 'Cursor snapshot expired or was evicted')
        snapshot = retained
      }
    }
    const needle = query.toLowerCase()
    const filtered = snapshot.stories.filter(story => (!input.supportPluginId || story.supportPluginId === input.supportPluginId) && (input.group == null || story.group === input.group) && (!needle || [...story.treePath, story.title, story.filePath, ...story.variants.map(v => v.title)].some(text => text.toLowerCase().includes(needle))))
    const items: McpStory[] = []
    const result = { projectId: options.projectId, revision: snapshot.revision, updating: options.updating(), items, total: filtered.length, diagnostics: [...snapshot.diagnostics], diagnosticsTruncated: snapshot.diagnosticsTruncated, nextCursor: undefined as string }
    while (items.length < pageSize && offset + items.length < filtered.length) {
      items.push(filtered[offset + items.length])
      if (Buffer.byteLength(JSON.stringify(result)) > MCP_LIMITS.responseBytes - 8192) {
        items.pop()
        break
      }
    }
    if (!items.length && offset < filtered.length) throw new McpDomainError('RESULT_TOO_LARGE', 'Catalog metadata page exceeds response limit')
    if (offset + items.length < filtered.length) result.nextCursor = cursors.create(snapshot.revision, fingerprint, offset + items.length)
    return result
  }
}
