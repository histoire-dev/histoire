import { describe, expect, it } from 'vitest'
import { validateHistoireCatalogStory } from '../bridge/catalog.js'

describe('story frame', () => {
  const story = { id: 'button', title: 'Button', docsOnly: false, path: ['Button'], variants: [{ id: 'a', title: 'A' }], content: { docs: false, rawSource: true } }

  it('accepts a layout with frame width, height and padding', () => {
    const layout = { type: 'grid', width: 200, height: 96, padding: 24 }
    expect(validateHistoireCatalogStory({ ...story, layout }).layout).toEqual(layout)
    expect(() => validateHistoireCatalogStory({ ...story, layout: { type: 'single', padding: 0 } })).not.toThrow()
  })

  it('rejects non-positive or non-finite frame sizes and negative padding', () => {
    for (const frame of [{ width: 0 }, { height: -1 }, { width: Number.NaN }, { height: Number.POSITIVE_INFINITY }, { width: '200' }, { padding: -4 }]) {
      expect(() => validateHistoireCatalogStory({ ...story, layout: { type: 'grid', ...frame } })).toThrow('Invalid story frame size')
    }
  })
})
