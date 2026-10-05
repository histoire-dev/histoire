import type { PageOwner } from './ownership.js'
import { describe, expect, it } from 'vitest'
import { samePageOwner } from './ownership.js'

describe('page completion attribution', () => {
  it('rejects replacement source, revision and canonical variant, even for same story', () => {
    const owner: PageOwner = { source: { sourceId: 'book', url: 'https://book.example/', mode: 'dev', epoch: 'epoch', revision: 'one' }, selection: { storyId: 'button', variantId: 'primary' } }
    expect(samePageOwner(owner, owner)).toBe(true)
    expect(samePageOwner(owner, { ...owner, source: { ...owner.source!, sourceId: 'other' } })).toBe(false)
    expect(samePageOwner(owner, { ...owner, source: { ...owner.source!, revision: 'two' } })).toBe(false)
    expect(samePageOwner(owner, { ...owner, selection: { storyId: 'button', variantId: 'other' } })).toBe(false)
    expect(samePageOwner(owner, { ...owner, selection: null })).toBe(false)
  })
})
