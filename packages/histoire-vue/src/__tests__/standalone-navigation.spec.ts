import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createStoryTreeRows } from '../../../histoire-app/src/app/components/panes/stories/tree.js'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('standalone URL adapter', () => {
  it.each(['history', 'hash'] as const)('round-trips explicit null without changing omitted remembered selection in %s mode', async (mode) => {
    const fixture = sourceFixture()
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    try {
      await navigation.router.push('/story/a:b?variantId=other')
      await navigation.synchronize()
      await selection.session.selection.select({ storyId: 'a:b', variantId: null })
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null })
      expect(navigation.router.currentRoute.value.query.variantId).toBeNull()
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null })
      await navigation.router.push('/story/a:b')
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
      // Runtime-originated deselection uses the same explicit nullable route.
      await core.selection.select({ storyId: 'a:b', variantId: null })
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.query.variantId).toBeNull())
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: null })
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      navigation.close()
      selection.close()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })

  it.each(['history', 'hash'] as const)('preserves exact deep links, grid defaults, chooser and panel state with %s routes', async (mode) => {
    const fixture = sourceFixture()
    const grid = fixture.descriptor.catalog.stories[1]
    grid.layout = { type: 'grid' }
    grid.variants.push({ ...grid.variants[0], id: 'second', title: 'Second' })
    fixture.descriptor.catalog.stories.push({ ...fixture.descriptor.catalog.stories[0], id: '..' })
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    try {
      await navigation.router.push('/story/a')
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a', variantId: 'b:c' })
      expect(navigation.router.currentRoute.value.query.variantId).toBe('b:c')
      await navigation.panel('events')
      expect(navigation.router.currentRoute.value.query.tab).toBe('events')
      await selection.session.selection.select({ storyId: '..', variantId: 'c' })
      expect(navigation.router.currentRoute.value.query).toEqual({ storyId: '..', variantId: 'c' })
      expect(core.getSnapshot().selection).toEqual({ storyId: '..', variantId: 'c' })
      await navigation.router.push('/story/a:b?variantId=c')
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
      await navigation.panel('events')
      // Runtime-originated grid clicks reach canonical controller directly.
      // URL adapter must observe those edits without duplicating route intents.
      const changes = vi.fn()
      const stop = navigation.router.afterEach(changes)
      await core.selection.select({ storyId: 'a:b', variantId: 'other' })
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.query).toEqual({ variantId: 'other', tab: 'events' }))
      await navigation.synchronize()
      expect(changes).toHaveBeenCalledOnce()
      stop()
      await navigation.router.push('/story/docs?variantId=_default')
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
      await expect(selection.fromRoute({ storyId: 'docs', variantId: 'invalid' })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' })
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      navigation.close()
      selection.close()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })

  it.each(['history', 'hash'] as const)('opens docs-only tree target with legacy synthetic variant from active preview in %s mode', async (mode) => {
    const fixture = sourceFixture()
    const docs = fixture.descriptor.catalog.stories.find(story => story.id === 'docs')!
    docs.variants = [{ id: '_default', title: 'Introduction' }]
    fixture.descriptor.catalog.tree = [...fixture.descriptor.catalog.tree, { kind: 'story', title: 'Introduction', storyId: docs.id }]
    window.history.replaceState({}, '', '/book/')
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/book/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const errors = vi.fn()
    const navigation = createStandaloneNavigation(selection, { base: '/book/', mode, error: errors })
    const preview = core.mount(document.createElement('div'), { surface: 'preview' })
    try {
      await preview.ready
      await navigation.router.push('/story/a:b?variantId=c&tab=docs')
      await navigation.synchronize()
      const snapshot = core.getSnapshot()
      const row = createStoryTreeRows(snapshot.catalog, snapshot.selection, []).find(row => row.story?.id === docs.id)!
      await selection.session.selection.select(row.target!)
      expect(core.getSnapshot().selection).toEqual({ storyId: docs.id, variantId: null })
      expect(navigation.router.currentRoute.value.params.storyId).toBe(docs.id)
      expect(navigation.router.currentRoute.value.query).toEqual({ variantId: null })
      await navigation.synchronize()
      expect(core.getSnapshot().selection).toEqual({ storyId: docs.id, variantId: null })
      expect(errors).not.toHaveBeenCalled()
    }
    finally {
      navigation.close()
      selection.close()
      await preview.unmount()
      await core.dispose()
      window.history.replaceState({}, '', '/')
    }
  })
})
