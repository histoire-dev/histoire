import { describe, expect, it } from 'vitest'
import { toEmbedUrl } from '../designs/embed-url.js'

describe('design embed URLs', () => {
  it.each(['design', 'file', 'proto', 'board', 'slides'])('embeds figma %s links through the embed host', (kind) => {
    const url = toEmbedUrl('figma', new URL(`https://www.figma.com/${kind}/KEY/My-File?node-id=1-2`), 'histoire')
    expect(url).toBe(`https://embed.figma.com/${kind}/KEY/My-File?node-id=1-2&embed-host=histoire`)
  })

  it('keeps figma embed links and their embed host', () => {
    expect(toEmbedUrl('figma', new URL('https://embed.figma.com/design/KEY?embed-host=acme'), 'histoire')).toBe('https://embed.figma.com/design/KEY?embed-host=acme')
    expect(toEmbedUrl('figma', new URL('https://embed.figma.com/design/KEY'), 'histoire')).toBe('https://embed.figma.com/design/KEY?embed-host=histoire')
  })

  it.each([
    'https://www.figma.com/community/file/123/Kit',
    'https://www.figma.com/site/KEY/Page',
    'https://figma.com/files/team/1',
  ])('reports figma links that cannot be framed: %s', (url) => {
    expect(toEmbedUrl('figma', new URL(url), 'histoire')).toBeUndefined()
  })

  it('embeds sketch share links', () => {
    expect(toEmbedUrl('sketch', new URL('https://www.sketch.com/s/SHARE/a/ARTBOARD'), 'histoire')).toBe('https://www.sketch.com/embed/s/SHARE/a/ARTBOARD')
    expect(toEmbedUrl('sketch', new URL('https://www.sketch.com/embed/s/SHARE'), 'histoire')).toBe('https://www.sketch.com/embed/s/SHARE')
  })

  it('uses penpot and plain iframe links as they are', () => {
    const penpot = 'https://penpot.example.com/#/view?file-id=F&page-id=P&share-id=S'
    expect(toEmbedUrl('penpot', new URL(penpot), 'histoire')).toBe(penpot)
    expect(toEmbedUrl('iframe', new URL('https://example.com/spec'), 'histoire')).toBe('https://example.com/spec')
  })
})
