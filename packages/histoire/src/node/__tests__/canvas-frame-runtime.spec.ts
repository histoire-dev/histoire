// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { observeCanvasFrameRuntime } from '../../../../histoire-app/src/app/components/canvas/frame-runtime.js'
import { createCanvasFrameState } from '../../../../histoire-app/src/app/components/canvas/frame-state.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'

describe('retained canvas document state', () => {
  it('seeds each actor once per physical document, including reloads with unchanged runtime ID', async () => {
    const source = sourceFixture()
    const owner = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, source.adapters)
    await owner.connect()
    await owner.selection.select({ storyId: 'a:b', variantId: 'c' })
    await owner.mount({} as HTMLElement, { surface: 'preview' }).ready
    const state = createCanvasFrameState(owner)
    const seed = vi.spyOn(state, 'seed')
    const ready = vi.fn()
    let physical = document.implementation.createHTMLDocument()
    const stop = observeCanvasFrameRuntime(owner, { state, document: () => physical, ready, loading: vi.fn(), error: vi.fn() })
    try {
      await vi.waitFor(() => expect(ready).toHaveBeenCalled())
      await owner.selection.select({ storyId: 'a:b', variantId: 'other' })
      await vi.waitFor(() => expect(seed).toHaveBeenCalledTimes(2))
      await owner.selection.select({ storyId: 'a:b', variantId: 'c' })
      await vi.waitFor(() => expect(ready.mock.calls.at(-1)?.[0].selection.variantId).toBe('c'))
      expect(seed).toHaveBeenCalledTimes(2)
      // Reload recovery can reuse URL/document ID; native Document identity cannot.
      physical = document.implementation.createHTMLDocument()
      for (const listener of source.frameListeners) listener({ type: 'runtime', ...source.owner(), runtime: { ...source.runtime(), status: 'mounting' } })
      source.ready()
      await vi.waitFor(() => expect(seed).toHaveBeenCalledTimes(3))
      expect(seed.mock.calls.at(-1)?.[1]).toEqual({ storyId: 'a:b', variantId: 'c' })
    }
    finally {
      stop()
      state.dispose()
      await owner.dispose()
    }
  })
})
