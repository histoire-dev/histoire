import { sanitizeDocsHtml } from '@histoire/vue/internal'
import MarkdownIt from 'markdown-it'

/** Raw HTML is disabled; agent text can only produce markdown-generated tags. */
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
// Every link opens outside the workbench; the sanitizer keeps `target` and adds nothing else.
markdown.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, index, options)
}

/** Settled replies render once; streaming text bypasses the cache. */
const cache = new Map<string, string>()
const CACHE_LIMIT = 100

/**
 * Renders agent markdown to sanitized HTML.
 * @param text Agent reply text.
 * @param document Document providing the sanitizer window.
 * @param settled Cache the result (final persisted replies).
 */
export async function renderAgentMarkdown(text: string, document: Document, settled: boolean): Promise<string> {
  const cached = settled ? cache.get(text) : undefined
  if (cached !== undefined) return cached
  const html = await sanitizeDocsHtml(markdown.render(text), document)
  if (settled) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(text, html)
  }
  return html
}
