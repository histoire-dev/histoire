import type { HistoireDocsContent } from '@histoire/protocol'
import { normalizeDocsLinks } from './links.js'
import { sanitizeDocsHtml } from './sanitize.js'

/** Prepared remote HTML accompanies original data, never replaces portable DTO contract. */
export interface HistoirePreparedDocs {
  /** Captured source body/provenance. */
  content: HistoireDocsContent
  /** Final sanitized HTML, or null for safely rendered plain text. */
  html: string | null
}

/** Native remote policy always sanitizes; legacy trusted-local renderer remains standalone adapter. */
export async function prepareHistoireDocs(content: HistoireDocsContent, base: string, document: Document, policy: 'remote' | 'trusted-local' = 'remote'): Promise<HistoirePreparedDocs> {
  const html = content.format === 'text' ? null : normalizeDocsLinks(content.body, base, document)
  return { content, html: html === null || policy === 'trusted-local' ? html : await sanitizeDocsHtml(html, document) }
}
