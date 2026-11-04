import type { HistoireDiagnostic } from '@histoire/protocol'
import type { CatalogDiagnostic } from './types.js'
import { Buffer } from 'node:buffer'
import { validId, validRelativePath } from './lookup.js'

/** Public limits keep project errors bounded independently of source contents. */
export const MAX_DIAGNOSTICS = 100

/** Byte cap of one bounded diagnostics list. */
export const MAX_DIAGNOSTIC_BYTES = 48 * 1024

/**
 * Bytes one diagnostic counts against {@link MAX_DIAGNOSTIC_BYTES}.
 * @param item Diagnostic record.
 */
function diagnosticBytes(item: object): number {
  return Buffer.byteLength(JSON.stringify(item)) + 1
}

/** Removes runtime credentials and canonical project roots from generated errors. */
export function sanitizeDiagnosticMessage(value: unknown, root: string, secret?: string): string {
  let message = value instanceof Error ? value.message : String(value)
  if (root) message = message.split(root).join('[project]')
  if (secret) message = message.split(secret).join('[redacted]')
  const bytes = Buffer.from(message, 'utf8')
  return bytes.length <= 4096 ? message : `${bytes.subarray(0, 4093).toString('utf8').replace(/\uFFFD$/, '')}…`
}

/** Deduplicates bounded diagnostics while reporting omitted records explicitly. */
export function boundedDiagnostics(items: CatalogDiagnostic[], max = MAX_DIAGNOSTICS) {
  // Collection failures can originate from invalid virtual metadata. Retain the
  // diagnostic without allowing those invalid identifiers to break every DTO.
  const projected = items.map(({ filePath, storyId, code, message }) => ({
    code,
    message,
    ...(validRelativePath(filePath) ? { filePath } : {}),
    ...(validId(storyId) ? { storyId } : {}),
  }))
  const unique = Array.from(new Map(projected.map(item => [JSON.stringify(item), item])).values())
  const diagnostics: CatalogDiagnostic[] = []
  let bytes = 0
  for (const item of unique) {
    const itemBytes = diagnosticBytes(item)
    if (diagnostics.length >= max || bytes + itemBytes > MAX_DIAGNOSTIC_BYTES) break
    bytes += itemBytes
    diagnostics.push(Object.freeze(item))
  }
  return { diagnostics: Object.freeze(diagnostics), diagnosticsTruncated: unique.length > diagnostics.length }
}

/**
 * Keeps the warnings that still fit beside already bounded diagnostics, so both lists together
 * respect the same count and byte caps.
 * @param bounded Output of {@link boundedDiagnostics}.
 * @param warnings Warnings produced after bounding (e.g. catalog projection).
 * @param max Count cap used for `bounded`.
 */
export function boundedWarnings(bounded: readonly CatalogDiagnostic[], warnings: readonly HistoireDiagnostic[], max = MAX_DIAGNOSTICS): HistoireDiagnostic[] {
  let count = bounded.length
  let bytes = bounded.reduce((sum, item) => sum + diagnosticBytes(item), 0)
  const kept: HistoireDiagnostic[] = []
  for (const warning of warnings) {
    const itemBytes = diagnosticBytes(warning)
    if (count >= max || bytes + itemBytes > MAX_DIAGNOSTIC_BYTES) break
    count++
    bytes += itemBytes
    kept.push(warning)
  }
  return kept
}
