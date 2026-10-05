import type { HistoireSourceContent } from '@histoire/protocol'
import { highlightHistoireSource } from './highlight.js'

/** Display preparation keeps source DTO separate from escaped generated syntax markup. */
export interface HistoirePreparedSource {
  /** Captured raw/dynamic body and provenance. */
  content: HistoireSourceContent
  /** Escaped highlighter output, or null for plain-text fallback. */
  html: string | null
}

/** Preserve original text; language hint never imports or evaluates story modules. */
export async function prepareHistoireSource(content: HistoireSourceContent, dark: boolean): Promise<HistoirePreparedSource> {
  const extension = content.relativePath?.split('.').pop()
  const language = content.language ?? ({ js: 'javascript', ts: 'typescript' }[extension ?? ''] ?? extension)
  return { content, html: await highlightHistoireSource(content.body, language, dark) }
}
