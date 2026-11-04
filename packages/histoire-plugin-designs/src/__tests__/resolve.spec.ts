import type { HistoireCatalogStory } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { resolveDesigns } from '../designs/resolve.js'

const options = { embedHost: 'histoire', baseUrl: 'https://book.test/docs/' }

/**
 * Catalog story with optional story and variant metadata.
 * @param storyMeta Story `meta`.
 * @param variantMeta Meta of variant `a`.
 */
function story(storyMeta?: object, variantMeta?: object): HistoireCatalogStory {
  return {
    id: 'button',
    title: 'Button',
    path: ['Button'],
    docsOnly: false,
    content: { docs: false, rawSource: false },
    ...(storyMeta ? { meta: storyMeta as never } : {}),
    variants: [{ id: 'a', title: 'A', ...(variantMeta ? { meta: variantMeta as never } : {}) }, { id: 'b', title: 'B' }],
  }
}

describe('design resolution', () => {
  it('uses variant designs over story designs and story designs for other variants', () => {
    const input = story({ design: { type: 'figma', url: 'https://www.figma.com/design/KEY' } }, { design: [{ type: 'link', url: 'https://example.com/spec', label: 'Spec' }] })
    expect(resolveDesigns(input, 'a', options).designs).toEqual([{ index: 0, type: 'link', name: 'Spec', label: 'Spec', externalUrl: 'https://example.com/spec' }])
    expect(resolveDesigns(input, 'b', options).designs).toEqual([{ index: 0, type: 'figma', name: 'Figma', src: 'https://embed.figma.com/design/KEY?embed-host=histoire', externalUrl: 'https://www.figma.com/design/KEY', allowFullscreen: false }])
  })

  it('resolves image paths against the book base', () => {
    const input = story({ design: [{ type: 'image', url: '/designs/a.png', scale: 2, offset: [10, -5] }, { type: 'image', url: 'b.png', name: 'Dark' }] })
    expect(resolveDesigns(input, 'a', options).designs).toMatchObject([
      { index: 0, type: 'image', name: 'Image', src: 'https://book.test/docs/designs/a.png', scale: 2, offset: [10, -5], alt: 'Image' },
      { index: 1, type: 'image', name: 'Dark', src: 'https://book.test/docs/b.png', alt: 'Dark' },
    ])
  })

  it('reports invalid entries and keeps the valid ones', () => {
    const input = story({ design: [
      { type: 'iframe', url: 'javascript:alert(1)' },
      { type: 'unknown', url: 'https://example.com' },
      { type: 'image', url: 'https://example.com/a.png', scale: 0 },
      { type: 'figma' },
      'https://example.com',
      { type: 'iframe', url: 'https://user:secret@example.com/page' },
      { type: 'figma', url: 'https://www.figma.com/community/file/123/Kit' },
      { type: 'iframe', url: 'https://example.com/page', allowFullscreen: true },
    ] })
    const { designs, issues } = resolveDesigns(input, 'a', options)
    expect(designs).toEqual([{ index: 7, type: 'iframe', name: 'example.com', src: 'https://example.com/page', externalUrl: 'https://example.com/page', allowFullscreen: true }])
    expect(issues.map(issue => issue.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(issues[5].message).toBe('Links with credentials are not allowed')
    expect(issues[6].message).toBe('This Figma link cannot be embedded; use a design, prototype, board or slides link')
  })

  it('has nothing to show without metadata', () => {
    expect(resolveDesigns(story(), 'a', options)).toEqual({ designs: [], issues: [] })
    expect(resolveDesigns(story({ other: true }), 'missing', options)).toEqual({ designs: [], issues: [] })
  })
})
