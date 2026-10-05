import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { snapshotScreenshotTargets } from '../../../histoire-app/src/app/util/screenshot-targets.js'

describe('displayed screenshot target snapshots', () => {
  it('keeps distinct Matrix cells and freezes nested props before asynchronous transport', () => {
    const targets = reactive([
      { storyId: 'story', variantId: 'base', frameKey: 'first', propsOverride: { emphasized: false, nested: { label: 'Captured' } } },
      { storyId: 'story', variantId: 'base', frameKey: 'second', propsOverride: { emphasized: true, nested: { label: 'Captured' } } },
    ])
    const captured = snapshotScreenshotTargets(targets)
    targets[0].propsOverride.nested.label = 'Edited'
    targets[1].propsOverride.emphasized = false
    expect(captured).toEqual([
      { storyId: 'story', variantId: 'base', frameKey: 'first', propsOverride: { emphasized: false, nested: { label: 'Captured' } } },
      { storyId: 'story', variantId: 'base', frameKey: 'second', propsOverride: { emphasized: true, nested: { label: 'Captured' } } },
    ])
  })

  it('bounds JSON cell props and rejects executable or non-finite values before transport', () => {
    const target = { storyId: 'story', variantId: 'base', frameKey: 'cell' }
    for (const propsOverride of [{ label: '界'.repeat(6000) }, { count: Number.NaN }, { callback: () => {} }]) {
      expect(() => snapshotScreenshotTargets([{ ...target, propsOverride }])).toThrow()
    }
    expect(snapshotScreenshotTargets([target])).toEqual([target])
  })
})
