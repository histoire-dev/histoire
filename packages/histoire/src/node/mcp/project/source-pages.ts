import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'
import { hashContent } from './content-hash.js'
import { requireTextPageBudget } from './text-pages.js'

/** Selects one-based LF/CRLF lines without introducing a terminal phantom line. */
export function pageSourceText(text: string, startLine: number = 1, lineCount: number = MCP_LIMITS.sourceLines) {
  if (!Number.isSafeInteger(startLine) || startLine < 1 || !Number.isSafeInteger(lineCount) || lineCount < 1 || lineCount > MCP_LIMITS.maxSourceLines) {
    throw new McpDomainError('SOURCE_UNAVAILABLE', 'Invalid source page range')
  }
  let totalLines = 0
  let offset = 0
  let selectedStart = 0
  let selectedEnd = 0
  // Scan offsets without splitting or copying every source line. Include
  // terminating newline in its original line, preserving CRLF byte-for-byte.
  while (offset < text.length) {
    totalLines++
    if (totalLines === startLine) selectedStart = offset
    const newline = text.indexOf('\n', offset)
    offset = newline < 0 ? text.length : newline + 1
    if (totalLines >= startLine && totalLines < startLine + lineCount) selectedEnd = offset
  }
  if (startLine > Math.max(1, totalLines)) throw new McpDomainError('SOURCE_UNAVAILABLE', 'Source page starts past file end')
  const endLine = Math.min(startLine + lineCount - 1, totalLines)
  const selected = text.slice(selectedStart, selectedEnd)
  requireTextPageBudget(selected)
  return { text: selected, startLine, endLine, totalLines, ...(endLine < totalLines ? { nextLine: endLine + 1 } : {}), sha256: hashContent(text) }
}
