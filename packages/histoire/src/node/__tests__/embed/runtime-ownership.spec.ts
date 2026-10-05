import { describe, expect, it } from 'vitest'
import { createRuntimeDocumentId, createRuntimeDocumentOwner } from '../../../../../histoire-app/src/embed/adapters/document.js'

describe('runtime document ownership', () => {
  it('rejects delayed grid selection after newer host intent, including return to same target', () => {
    const owner = createRuntimeDocumentOwner()
    owner.replace('document', { storyId: 'story', variantId: 'one' })
    const delayed = { documentId: 'document', storyId: 'story', variantId: 'two', selectionVersion: owner.selectionVersion }
    expect(owner.acceptsSelection(delayed)).toBe(true)
    owner.select({ storyId: 'story', variantId: 'two' })
    owner.select({ storyId: 'story', variantId: 'one' })
    expect(owner.acceptsSelection(delayed)).toBe(false)
    expect(owner.acceptsSelection({ ...delayed, selectionVersion: owner.selectionVersion })).toBe(true)
    expect(owner.acceptsSelection({ ...delayed, selectionVersion: undefined })).toBe(false)
    owner.replace('replacement', { storyId: 'story', variantId: 'one' })
    expect(owner.acceptsSelection({ ...delayed, selectionVersion: owner.selectionVersion })).toBe(false)
  })
  it('mints distinct replacement documents when nested Explorer reuses primary mount identity', () => {
    const retired = createRuntimeDocumentId('explorer:primary')
    const replacement = createRuntimeDocumentId('explorer:primary')
    const owner = createRuntimeDocumentOwner()
    owner.replace(retired, { storyId: 'normal', variantId: 'one' })
    owner.close()
    owner.replace(replacement, { storyId: 'grid', variantId: 'first' })
    expect(retired).not.toBe(replacement)
    expect(owner.accepts({ documentId: retired, storyId: 'grid', variantId: 'first' })).toBe(false)
    expect(owner.accepts({ documentId: replacement, storyId: 'grid', variantId: 'first' })).toBe(true)
  })
  it('drops same-story replies from retired documents and exact tuple mismatch', () => {
    const owner = createRuntimeDocumentOwner()
    owner.replace('document-one', { storyId: 'story:one', variantId: 'shared' })
    expect(owner.accepts({ documentId: 'document-one', storyId: 'story:one', variantId: 'shared' })).toBe(true)
    owner.replace('document-two', { storyId: 'story:one', variantId: 'shared' })
    expect(owner.accepts({ documentId: 'document-one', storyId: 'story:one', variantId: 'shared' })).toBe(false)
    expect(owner.accepts({ documentId: 'document-two', storyId: 'story:other', variantId: 'shared' })).toBe(false)
    owner.close()
    expect(owner.accepts({ documentId: 'document-two', storyId: 'story:one', variantId: 'shared' })).toBe(false)
  })
})
