import { describe, expect, it } from 'vitest'
import { createCanvasFrameState } from '../../../../histoire-app/src/app/components/canvas/frame-state.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'

describe('passive canvas state projection', () => {
  it('captures each observed frame independently without changing canonical state', async () => {
    const source = sourceFixture()
    const firstSource = sourceFixture()
    const secondSource = sourceFixture()
    const canonical = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, source.adapters)
    const first = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, firstSource.adapters)
    const second = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, secondSource.adapters)
    await Promise.all([canonical.connect(), first.connect(), second.connect()])
    const firstTarget = { storyId: 'a:b', variantId: 'c' }
    const secondTarget = { storyId: 'a:b', variantId: 'other' }
    await first.selection.select(firstTarget)
    await second.selection.select(secondTarget)
    await Promise.all([first.mount({} as HTMLElement, { surface: 'preview' }).ready, second.mount({} as HTMLElement, { surface: 'preview' }).ready])
    const retained = createCanvasFrameState(canonical)
    try {
      const stopFirst = retained.observe(first)
      retained.observe(second)
      await first.state.patch({ label: 'First frame' })
      await second.state.patch({ label: 'Second frame' })
      expect(retained.getPatch(firstTarget)).toMatchObject({ label: 'First frame' })
      expect(retained.getPatch(secondTarget)).toMatchObject({ label: 'Second frame' })
      expect(canonical.getSnapshot().state).toBeNull()
      stopFirst()
      await first.state.patch({ label: 'Retired observer' })
      expect(retained.getPatch(firstTarget)).toMatchObject({ label: 'First frame' })
    }
    finally {
      retained.dispose()
      await Promise.all([canonical.dispose(), first.dispose(), second.dispose()])
    }
  })

  it('retains Gamma for recreated passive target while canonical Alpha remains authoritative', async () => {
    const first = { storyId: 'a:b', variantId: 'c' }
    const second = { storyId: 'a:b', variantId: 'other' }
    const canonicalSource = sourceFixture()
    const passiveSource = sourceFixture()
    // Derived metadata originates in source runtime, never in editable host patches.
    await canonicalSource.request('state.patch', { _hPropDefs: [{ index: 0, props: [{ name: 'label' }] }] })
    canonicalSource.request.mockClear()
    const canonical = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, canonicalSource.adapters)
    const passive = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, passiveSource.adapters)
    await canonical.connect()
    await canonical.selection.select(first)
    await canonical.mount({} as HTMLElement, { surface: 'preview' }).ready
    const retained = createCanvasFrameState(canonical)
    try {
      retained.observe(canonical)
      await canonical.state.patch({ label: 'Gamma' })
      expect(canonical.getSnapshot().state?.value).toHaveProperty('_hPropDefs')
      expect(retained.getPatch(first)).not.toHaveProperty('_hPropDefs')
      await canonical.selection.select(second)
      await canonical.state.patch({ label: 'Alpha' })
      await passive.connect()
      await passive.selection.select(first)
      await passive.mount({} as HTMLElement, { surface: 'preview' }).ready
      await retained.seed(passive, first)
      expect(passive.getSnapshot().state?.value).toMatchObject({ label: 'Gamma' })
      expect(canonical.getSnapshot().state?.value).toMatchObject({ label: 'Alpha' })
      expect(retained.getPatch(second)).toMatchObject({ label: 'Alpha' })
      await retained.seed(passive, second)
      expect(passive.getSnapshot().state?.value).toMatchObject({ label: 'Gamma' })
      const detached = retained.getPatch(first)!
      detached.label = 'Passive edit'
      await passive.state.patch(detached)
      expect(retained.getPatch(first)).toMatchObject({ label: 'Gamma' })
      expect(canonicalSource.request.mock.calls.filter(([command]) => command === 'state.patch')).toHaveLength(2)
    }
    finally {
      retained.dispose()
      await passive.dispose()
      await canonical.dispose()
    }
  })

  it('invalidates changed executable target and epoch without recapturing reused old mirror', async () => {
    const target = { storyId: 'a:b', variantId: 'c' }
    const source = sourceFixture()
    source.descriptor.catalog.stories[0].runtimeRevision = '1'.repeat(64)
    const canonical = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, source.adapters)
    await canonical.connect()
    await canonical.selection.select(target)
    await canonical.mount({} as HTMLElement, { surface: 'preview' }).ready
    const retained = createCanvasFrameState(canonical)
    try {
      retained.observe(canonical)
      await canonical.state.patch({ label: 'Gamma' })
      source.descriptor.revision = 'unrelated-publication'
      source.emitCatalog()
      expect(retained.getPatch(target)).toMatchObject({ label: 'Gamma' })
      source.descriptor.catalog.stories[0].runtimeRevision = '2'.repeat(64)
      source.descriptor.revision = 'changed-publication'
      source.emitCatalog()
      expect(retained.getPatch(target)).toBeUndefined()
      await canonical.state.patch({ label: 'New generation', _hPropState: { 0: { label: 'New prop' } } })
      expect(retained.getPatch(target)).toMatchObject({ label: 'New generation', _hPropState: { 0: { label: 'New prop' } } })
      source.descriptor.epoch = 'next-epoch'
      source.emitCatalog()
      expect(retained.getPatch(target)).toBeUndefined()
    }
    finally {
      retained.dispose()
      await canonical.dispose()
    }
  })
})
