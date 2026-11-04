import type { DiagnosticsCollectionDto } from '@histoire/cli/protocol/diagnostics'
import type { CatalogSnapshot } from '../../catalog/types.js'
import { truncateText } from '@histoire/cli/protocol/core'
import { DIAGNOSTICS_BOUNDS } from '@histoire/cli/protocol/diagnostics'
import { sanitizeText } from '@histoire/cli/sanitize'

/**
 * Projects the issues of a completed catalog snapshot. The catalog already removed the
 * project root and credential from messages; terminal controls are stripped and text is
 * bounded again here because the output reaches a terminal.
 * @param snapshot Current catalog snapshot of this generation.
 */
export function projectCollectionDiagnostics(snapshot: CatalogSnapshot): DiagnosticsCollectionDto {
  return {
    outcome: snapshot.outcome,
    stories: snapshot.stories.length,
    variants: snapshot.stories.reduce((total, story) => total + story.variants.length, 0),
    issues: snapshot.diagnostics.length,
    truncated: snapshot.diagnosticsTruncated,
    items: snapshot.diagnostics.slice(0, DIAGNOSTICS_BOUNDS.issues).map(issue => ({
      code: truncateText(sanitizeText(issue.code), 64).text,
      message: truncateText(sanitizeText(issue.message), DIAGNOSTICS_BOUNDS.text).text,
      ...(issue.filePath ? { file: truncateText(sanitizeText(issue.filePath), DIAGNOSTICS_BOUNDS.text).text } : {}),
      ...(issue.storyId ? { storyId: truncateText(sanitizeText(issue.storyId), DIAGNOSTICS_BOUNDS.text).text } : {}),
    })),
  }
}
