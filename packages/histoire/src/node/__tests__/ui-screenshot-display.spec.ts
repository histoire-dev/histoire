import { describe, expect, it } from 'vitest'
import { catalogTargetLabel } from '../../../../histoire-app/src/app/util/catalog-target.js'
import { screenshotFileDetails } from '../../../../histoire-app/src/app/util/screenshot-file.js'
import { commentStory } from './utils/comments.js'

describe('recent screenshot identity', () => {
  it('resolves catalog labels by exact IDs and preserves unavailable identities', () => {
    const catalog = { stories: [commentStory] }
    expect(catalogTargetLabel({ storyId: commentStory.id, variantId: commentStory.variants[0].id }, catalog)).toBe('Button › Loading')
    expect(catalogTargetLabel({ storyId: commentStory.id, variantId: 'removed / variant' }, catalog)).toBe('Button › removed / variant')
    expect(catalogTargetLabel({ storyId: 'removed:story', variantId: 'removed:variant' }, catalog)).toBe('removed:story › removed:variant')
  })

  it('keeps same-prefix captures distinct with UUID suffix, format and capture timestamp', () => {
    const timestamp = Date.parse('2026-10-03T20:30:45.678Z')
    const prefix = `.histoire/screenshots/long-story-id--long-variant-id--${timestamp}-`
    const first = screenshotFileDetails(`${prefix}11111111-1111-1111-1111-000000000001.png`)
    const second = screenshotFileDetails(`${prefix}11111111-1111-1111-1111-000000000002.png`)
    const webp = screenshotFileDetails(`${prefix}11111111-1111-1111-1111-000000000001.webp`)
    expect(first.shortName).toBe('…000000000001.png')
    expect(second.shortName).toBe('…000000000002.png')
    expect(webp.shortName).toBe('…000000000001.webp')
    expect(first.capturedAt).toBe('2026-10-03T20:30:45.678Z')
    expect(first.name).toBe(`${prefix.split('/').pop()}11111111-1111-1111-1111-000000000001.png`)
  })

  it('retains unknown filenames without inventing capture dates', () => {
    expect(screenshotFileDetails('.histoire/screenshots/saved.png')).toEqual({ name: 'saved.png', shortName: 'saved.png', capturedAt: undefined })
    expect(screenshotFileDetails('.histoire/screenshots/story--variant--99999999999999999999-11111111-1111-1111-1111-000000000001.png').capturedAt).toBeUndefined()
  })
})
