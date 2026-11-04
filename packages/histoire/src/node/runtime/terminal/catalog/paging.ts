import { Buffer } from 'node:buffer'
import { CATALOG_PAGE_BYTES } from '@histoire/cli/protocol/catalog'
import { TERMINAL_BOUNDS, TerminalError } from '@histoire/cli/protocol/core'

/**
 * Decodes the offset of a cursor this module issued.
 * @param cursor Opaque value from the previous page, absent for the first page.
 * @param total Items in the filtered list.
 */
export function readOffset(cursor: string | undefined, total: number): number {
  if (cursor === undefined) return 0
  const offset = /^\d{1,9}$/.test(cursor) ? Number(cursor) : -1
  if (offset < 0 || offset > total) throw new TerminalError('invalid', 'Invalid cursor')
  return offset
}

/**
 * Takes the next page under both the item and the byte bound, projecting only the items it
 * returns. An entry that alone exceeds the byte bound cannot be represented, so the read
 * fails explicitly instead of looping on an empty page.
 * @param items Complete filtered list of one revision.
 * @param offset Start offset.
 * @param limit Requested items, at most the protocol page size.
 * @param project Maps a canonical item to its DTO.
 * @param overheadBytes Serialized size of the page envelope without items.
 * @returns The page items and the cursor of the next page, if any.
 */
export function takePage<S, T>(items: readonly S[], offset: number, limit: number | undefined, project: (item: S) => T, overheadBytes = 1024): { page: T[], next?: string } {
  const page: T[] = []
  let bytes = overheadBytes
  while (page.length < Math.min(limit ?? TERMINAL_BOUNDS.pageItems, TERMINAL_BOUNDS.pageItems) && offset + page.length < items.length) {
    const entry = project(items[offset + page.length])
    // +1 for the array separator.
    bytes += Buffer.byteLength(JSON.stringify(entry)) + 1
    if (bytes > CATALOG_PAGE_BYTES) break
    page.push(entry)
  }
  if (!page.length && offset < items.length) throw new TerminalError('failed', 'Catalog entry exceeds the page bound')
  const end = offset + page.length
  return { page, ...(end < items.length ? { next: String(end) } : {}) }
}
