import type { McpDiagnostic } from '../protocol/project-schema.js'
import { Buffer } from 'node:buffer'
import { mcpIdSchema, mcpRelativePathSchema } from '../protocol/ids.js'
import { MCP_LIMITS } from '../protocol/limits.js'

/** Public limits keep project errors bounded independently of source contents. */
export const MAX_DIAGNOSTICS = MCP_LIMITS.diagnostics

/** Removes runtime credentials and canonical project roots from generated errors. */
export function sanitizeDiagnosticMessage(value: unknown, root: string, secret?: string): string {
  let message = value instanceof Error ? value.message : String(value)
  if (root) message = message.split(root).join('[project]')
  if (secret) message = message.split(secret).join('[redacted]')
  const bytes = Buffer.from(message, 'utf8')
  return bytes.length <= 4096 ? message : `${bytes.subarray(0, 4093).toString('utf8').replace(/\uFFFD$/, '')}…`
}

/** Deduplicates bounded diagnostics while reporting omitted records explicitly. */
export function boundedDiagnostics(items: McpDiagnostic[]) {
  // Collection failures can originate from invalid virtual metadata. Retain the
  // diagnostic without allowing those invalid identifiers to break every DTO.
  const projected = items.map(({ filePath, storyId, code, message }) => ({
    code,
    message,
    ...(mcpRelativePathSchema.safeParse(filePath).success ? { filePath } : {}),
    ...(mcpIdSchema.safeParse(storyId).success ? { storyId } : {}),
  }))
  const unique = Array.from(new Map(projected.map(item => [JSON.stringify(item), item])).values())
  const diagnostics: McpDiagnostic[] = []
  let bytes = 0
  for (const item of unique) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1
    if (diagnostics.length >= MAX_DIAGNOSTICS || bytes + itemBytes > 48 * 1024) break
    bytes += itemBytes
    diagnostics.push(Object.freeze(item))
  }
  return { diagnostics: Object.freeze(diagnostics), diagnosticsTruncated: unique.length > diagnostics.length }
}
