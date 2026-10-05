import { expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { deferred, sourceFixture } from './fixtures/session.js'

/** Publication callbacks cannot transfer predecessor ACK to replacement owner. */
it.each(['navigation', 'publication', 'dispose'] as const)('rejects selection superseded by %s during runtime ready publication', async (action) => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  const acknowledgment = deferred<void>()
  const delegate = fixture.request.getMockImplementation()!
  let successor: Promise<void> | undefined
  try {
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as HTMLElement, { surface: 'preview' }).ready
    fixture.request.mockImplementation(async (command, payload) => {
      if (command === 'selection.select' && payload.variantId === 'c') await acknowledgment.promise
      return delegate(command, payload)
    })
    const stop = session.subscribe((snapshot) => {
      if (snapshot.selection?.variantId !== 'other' || snapshot.runtime.status !== 'ready') return
      stop()
      if (action === 'navigation') {
        successor = session.selection.select({ storyId: 'a:b', variantId: 'c' })
      }
      else if (action === 'publication') {
        fixture.descriptor.revision = 'revision-2'
        fixture.emitCatalog()
      }
      else {
        successor = session.dispose()
      }
    })
    let result: unknown
    const original = session.selection.select({ storyId: 'a:b', variantId: 'other' })
    void original.then(() => {
      result = 'unexpected success'
    }, (error) => {
      result = error
    })
    const code = action === 'dispose' ? 'DISPOSED' : action === 'publication' ? 'STALE_REVISION' : 'RUNTIME_CHANGED'
    // Original settles before successor ACK; it must not adopt successor waiter.
    await vi.waitFor(() => expect(result).toMatchObject({ code }), { timeout: 500 })
    acknowledgment.resolve()
    await successor
  }
  finally {
    acknowledgment.resolve()
    await session.dispose()
  }
})
