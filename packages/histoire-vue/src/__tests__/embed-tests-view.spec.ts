import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedTestsView } from '../../../histoire-app/src/embed/adapters/tests-view.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

describe('embedded tests view', () => {
  it('collects definitions for ready canvas and stops when view closes', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const collect = vi.spyOn(session.tests, 'collect').mockResolvedValue({ definitions: [] })
    const run = vi.spyOn(session.tests, 'run')
    const container = document.createElement('div')
    const view = createEmbedTestsView({ container, session, signal: new AbortController().signal } as any)
    const canvas = session.mount(document.createElement('div'), { surface: 'preview' })
    try {
      await canvas.ready
      await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce())
      expect(run).not.toHaveBeenCalled()
      view.close()
      for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtime: { ...fixture.runtime(), status: 'mounting' } })
      fixture.ready()
      await Promise.resolve()
      expect(collect).toHaveBeenCalledOnce()
    }
    finally {
      view.close()
      await canvas.unmount()
      await session.dispose()
    }
  })
})
