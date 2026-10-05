import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { describe, expect, it, vi } from 'vitest'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireContentController } from '../content/controller.js'

describe('panel content request ownership', () => {
  it('retires pending preparation and reads no content after source disconnect or session disposal', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const pending = deferred<string>()
    const publish = vi.fn()
    const read = vi.fn().mockReturnValue(pending.promise)
    const controller = createHistoireContentController(session, () => [session.getSnapshot().status], read, publish)
    const operation = controller.start()
    fixture.emitDisconnect()
    await vi.waitFor(() => expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'idle', value: null }))
    pending.resolve('retired')
    await operation
    await session.dispose()
    expect(read).toHaveBeenCalledOnce()
    expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'idle', value: null })
    controller.close()
  })
  it('suppresses old reads and preparation after selection or revision changes', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const delayed = deferred<string>()
    const publish = vi.fn()
    const read = vi.fn().mockReturnValueOnce(delayed.promise).mockResolvedValue('new')
    const controller = createHistoireContentController(session, () => [session.getSnapshot().source?.revision, session.getSnapshot().selection?.storyId], read, publish)
    const first = controller.start()
    await session.selection.select({ storyId: 'a', variantId: 'b:c' })
    await vi.waitFor(() => expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'ready', value: 'new' }))
    delayed.resolve('old')
    await first
    expect(publish.mock.lastCall?.[0]).toMatchObject({ value: 'new' })
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    controller.close()
    await session.dispose()
  })

  it('observes rejected abandoned work and never renders an unsanitized fallback', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    const delayed = deferred<string>()
    const publish = vi.fn()
    const controller = createHistoireContentController(session, () => [], () => delayed.promise, publish)
    const operation = controller.start()
    controller.close()
    delayed.reject(new Error('sanitizer failed'))
    await operation
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'loading', value: null })
    await session.dispose()
  })
})
