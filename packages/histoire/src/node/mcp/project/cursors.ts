import { randomBytes } from 'node:crypto'
import { decodeMcpCursor, encodeMcpCursor } from '../protocol/cursors.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { hashContent } from './content-hash.js'

/** Private validated cursor state; caller sees only a random capability. */
interface CursorRecord {
  /** Snapshot identity is never inferred from current catalog. */
  revision: string
  /** Exact normalized query, filters and page size. */
  fingerprint: string
  /** Offset in the retained filtered snapshot. */
  offset: number
  /** Absolute monotonic-style timestamp from injected clock. */
  expiresAt: number
}

/** Bounded server-side cursors avoid caller-forged offsets or project/revision IDs. */
export function createCatalogCursors(projectId: string, now: () => number = Date.now) {
  const records = new Map<string, CursorRecord>()
  /** Removes expired capabilities before allocating more records. */
  function prune() {
    for (const [key, value] of records) {
      if (value.expiresAt <= now()) records.delete(key)
    }
  }
  return {
    /** Generates an opaque capability for exactly one retained snapshot/filter. */
    create(revision: string, fingerprint: string, offset: number) {
      prune()
      if (records.size >= 1000) records.delete(records.keys().next().value)
      const encoded = encodeMcpCursor({ projectId, revision, filterHash: hashContent(fingerprint), offset })
      // Nonce gives each issued page an independent lifetime even if the same
      // snapshot/page is requested again. The shared codec validates its data;
      // this map remains authority for issuance and retention.
      const token = `${encoded}.${randomBytes(24).toString('base64url')}`
      records.set(token, { revision, fingerprint, offset, expiresAt: now() + MCP_LIMITS.cursorRetentionMs })
      return token
    },
    /** Resolves one capability without accepting mutated paging parameters. */
    read(token: string, fingerprint: string) {
      const value = records.get(token)
      if (!value) throw new McpDomainError('INVALID_CURSOR', 'Invalid or foreign cursor')
      if (value.expiresAt <= now()) throw new McpDomainError('CURSOR_EXPIRED', 'Cursor expired')
      if (value.fingerprint !== fingerprint) throw new McpDomainError('INVALID_CURSOR', 'Cursor filters differ from original page')
      decodeMcpCursor(token.slice(0, token.lastIndexOf('.')), { projectId, filterHash: hashContent(fingerprint), revision: value.revision })
      return value
    },
  }
}
