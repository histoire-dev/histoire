import { HistoireSdkError } from '@histoire/protocol'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireTestsController } from '../tests/controller.js'

describe('test controller cancellation ownership', () => {
  it('keeps retirement idle when cancellation synchronously invalidates preview readiness', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const preview = session.mount(document.createElement('div'), { surface: 'preview' })
    await preview.ready
    vi.spyOn(session.tests, 'run').mockImplementation(options => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => {
        for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtime: { ...fixture.runtime(), status: 'mounting' } })
        reject(new HistoireSdkError('CANCELLED', 'Preview retired'))
      }, { once: true })
    }))
    const publish = vi.fn()
    const controller = createHistoireTestsController(session, publish)
    try {
      const operation = controller.run('preview')
      expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'running', target: { storyId: 'a:b', variantId: 'c' }, source: { revision: 'revision-1' } })
      controller.cancel()
      await expect(operation).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'idle', target: null, summary: null })
    }
    finally {
      controller.close()
      await preview.unmount()
      await session.dispose()
    }
  })
})
