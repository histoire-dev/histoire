import { describe, expect, it } from 'vitest'
import { getEmbedRelativeUrl, parseEmbedDocumentOptions, parseEmbedPresentation, validateEmbedPresentation } from '../url/embed.js'

describe('scoped embed links', () => {
  it.each(['a:b/c & "quoted" </script> 日本語', '.', '..'])('preserves exact identities %s under a deployment base', (id) => {
    const url = new URL(getEmbedRelativeUrl({ base: '/books/ui/', storyId: id, variantId: `${id}:variant`, panels: ['events', 'controls'] }), 'https://book.test')
    expect(url.pathname).toBe('/books/ui/__embed.html')
    expect(parseEmbedDocumentOptions(url.searchParams)).toEqual({ storyId: id, variantId: `${id}:variant`, panels: ['controls', 'events'] })
  })

  it('distinguishes story links and canvas-only variant links', () => {
    expect(parseEmbedDocumentOptions(new URLSearchParams('storyId=story'))).toEqual({ storyId: 'story', panels: ['controls'] })
    expect(parseEmbedDocumentOptions(new URLSearchParams('storyId=story&variantId=one&panels='))).toEqual({ storyId: 'story', variantId: 'one', panels: [] })
    expect(getEmbedRelativeUrl({ base: '/', storyId: 'story', panels: [] })).toBe('/__embed.html?view=embed&storyId=story&panels=')
  })

  it('rejects malformed Unicode before URLSearchParams can replace its identity', () => {
    expect(() => getEmbedRelativeUrl({ base: '/', storyId: '\uD800' })).toThrow()
    expect(() => getEmbedRelativeUrl({ base: '/', storyId: 'story', variantId: '\uD800' })).toThrow()
  })

  it.each(['storyId=', 'storyId=a&storyId=b', 'storyId=a&variantId=', 'storyId=a&variantId=x&variantId=y', 'storyId=a&panels=tests', 'storyId=a&panels=controls&panels=events'])('rejects malformed target or panel input %s', (search) => {
    expect(() => parseEmbedDocumentOptions(new URLSearchParams(search))).toThrow()
  })

  it('validates SDK hints independently from target and bridge authority', () => {
    expect(parseEmbedPresentation(new URLSearchParams('presentation=embed&scope=story&panels=docs,controls'))).toEqual({ type: 'embed', scope: 'story', panels: ['controls', 'docs'] })
    expect(parseEmbedPresentation(new URLSearchParams('view=surface&surface=explorer'))).toBeUndefined()
    expect(() => parseEmbedPresentation(new URLSearchParams('presentation=other'))).toThrow()
    expect(() => validateEmbedPresentation({ type: 'embed', scope: 'variant', panels: ['tests'] })).toThrow()
    expect(validateEmbedPresentation({ type: 'embed', scope: 'variant' })).toEqual({ type: 'embed', scope: 'variant', panels: ['controls'] })
  })
})
