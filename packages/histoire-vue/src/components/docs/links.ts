import type { HistoireStoryLink } from '@histoire/sdk/internal'
import { isStoryRouteHash, parseStoryRouteQuery, resolveStoryRouteSelection } from '@histoire/protocol'

/** Metadata sufficient for exact story/variant routing; no loaders or host router. */
interface StoryTarget {
  /** Canonical collected story identity. */
  id: string
  /** Exact portable file label for precollection Markdown route compatibility. */
  relativePath?: string
  /** Exact story-scoped variant identities. */
  variants: readonly { id: string }[]
}

/** Normalize inert markup before final sanitizer; output is never inserted unsanitized. */
export function normalizeDocsLinks(html: string, base: string, document: Document): string {
  const template = document.createElement('template')
  template.innerHTML = html
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    for (const attribute of ['href', 'src', 'poster', 'cite']) {
      const value = element.getAttribute(attribute)
      if (!value || (attribute === 'href' && value.startsWith('#'))) continue
      try {
        const url = new URL(value, base)
        const schemes = attribute === 'href' ? ['http:', 'https:', 'mailto:', 'tel:'] : ['http:', 'https:']
        if (!schemes.includes(url.protocol) || url.username || url.password) element.removeAttribute(attribute)
        else element.setAttribute(attribute, url.href)
      }
      catch { element.removeAttribute(attribute) }
    }
    // Responsive image candidates need a full parser. Keep authoritative src;
    // untrusted srcset must not introduce a second URL resolution policy.
    element.removeAttribute('srcset')
    if (element.tagName === 'A') {
      if (element.getAttribute('href')?.startsWith('#')) element.removeAttribute('target')
      else element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }
  return template.innerHTML
}

/** Decode finite source route; catalog validates IDs before selection intent. */
export function resolveDocsStoryLink(href: string, base: string, stories: readonly StoryTarget[], relativePath?: string | null): HistoireStoryLink | null {
  try {
    const book = new URL(base)
    let url = new URL(href, book)
    if (url.origin !== book.origin) return null
    if (url.pathname === book.pathname && isStoryRouteHash(url.hash)) url = new URL(url.hash.slice(2), book)
    const prefix = `${book.pathname}story`
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null
    const encoded = url.pathname.slice(prefix.length).replace(/^\//, '')
    if (encoded.includes('/')) return null
    const query = parseStoryRouteQuery(url.search)
    const input = resolveStoryRouteSelection({ storyId: decodeURIComponent(encoded) }, query)
    if (!input) return null
    let matches = stories.filter(story => story.id === input.storyId)
    // Markdown renders before custom IDs finish collection. Source supplies
    // exact portable file label; resolve catalog record without slug guessing.
    if (!matches.length && relativePath) matches = stories.filter(story => story.relativePath === relativePath)
    if (matches.length !== 1) return null
    const storyId = matches[0].id
    const variantId = input.variantId
    if (variantId !== undefined && variantId !== null && matches[0].variants.filter(variant => variant.id === variantId).length !== 1) return null
    return { selection: { ...input, storyId }, ...(typeof query.tab === 'string' ? { panel: query.tab } : {}), ...(url.hash ? { anchor: url.hash } : {}) }
  }
  catch { return null }
}
