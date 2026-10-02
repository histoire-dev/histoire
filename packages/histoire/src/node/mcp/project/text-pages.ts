import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS, mcpByteLength } from '../protocol/limits.js'
import { hashContent } from './content-hash.js'

/** Rejects selected content whose JSON encoding leaves no room for DTO metadata. */
export function requireTextPageBudget(text: string): void {
  if (mcpByteLength(JSON.stringify(text)) > MCP_LIMITS.responseBytes - 8192) {
    throw new McpDomainError('RESULT_TOO_LARGE', 'Selected text page exceeds response byte limit')
  }
}

/** Pages original documentation in Unicode code points, retaining its full hash. */
export function pageDocsText(text: string, offset: number = 0, limit: number = MCP_LIMITS.docsCharacters) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MCP_LIMITS.maxDocsCharacters) {
    throw new McpDomainError('DOCS_NOT_FOUND', 'Invalid documentation page range')
  }
  let totalCharacters = 0
  const selectedPoints: string[] = []
  // Iterate complete text for its public length, retaining only this page.
  // for-of follows Unicode code points without splitting surrogate pairs.
  for (const point of text) {
    if (totalCharacters >= offset && selectedPoints.length < limit) selectedPoints.push(point)
    totalCharacters++
  }
  if (offset > totalCharacters) throw new McpDomainError('DOCS_NOT_FOUND', 'Documentation page offset is past document end')
  const end = offset + selectedPoints.length
  const selected = selectedPoints.join('')
  requireTextPageBudget(selected)
  return { text: selected, offset, ...(end < totalCharacters ? { nextOffset: end } : {}), totalCharacters, sha256: hashContent(text) }
}

/** Checks the complete success envelope after adding catalog identities/paths. */
export function requireContentResponseBudget(data: unknown): void {
  if (mcpByteLength(JSON.stringify({ ok: true, data })) > MCP_LIMITS.responseBytes) {
    throw new McpDomainError('RESULT_TOO_LARGE', 'Content metadata and selected text exceed response byte limit')
  }
}
