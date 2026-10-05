import { describe, expect, it, vi } from 'vitest'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { dispatchHistoireSessionCommand } from '../transport/session-commands.js'
import { deferred, sourceFixture } from './fixtures/session.js'

describe('finite view state mutation ownership', () => {
  it('rejects document replacement between mutation and acknowledgment read', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount({} as HTMLElement, { surface: 'preview' })
    await primary.ready
    const mutation = deferred<void>()
    const patch = vi.spyOn(session.state, 'patch').mockImplementation(() => mutation.promise)
    const get = vi.spyOn(session.state, 'get')
    const operation = dispatchHistoireSessionCommand(session, 'state.patch', { count: 8 })
    fixture.reload()
    mutation.resolve()
    try {
      await expect(operation).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
      expect(get).not.toHaveBeenCalled()
    }
    finally {
      patch.mockRestore()
      get.mockRestore()
      await session.dispose()
    }
  })
})
