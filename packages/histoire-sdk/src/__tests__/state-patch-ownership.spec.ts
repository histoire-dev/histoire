import type { HistoireRequestCapture } from '../adapters/types.js'
import { expect, it } from 'vitest'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { sourceFixture } from './fixtures/session.js'

it('rejects queued patch when source changes between readiness settlement and mutation continuation', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  const delegate = fixture.request.getMockImplementation()!
  const mutations: { revision: string | undefined, payload: unknown }[] = []
  fixture.request.mockImplementation(async (command, payload, capture?: HistoireRequestCapture) => {
    if (command === 'state.patch') mutations.push({ revision: capture?.revision, payload })
    return delegate(command, payload)
  })
  let stop = () => {}
  try {
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as HTMLElement, { surface: 'preview' }).ready
    fixture.reload()
    const patch = session.state.patch({ count: 37 })
    const result = patch.then(() => 'fulfilled', error => error.code)
    await Promise.resolve()
    await Promise.resolve()
    stop = session.subscribe((snapshot) => {
      if (snapshot.runtime.status !== 'ready') return
      stop()
      // Owned readiness guard and awaiting service resume in separate microtasks.
      queueMicrotask(() => queueMicrotask(() => {
        fixture.descriptor.revision = 'replacement-content'
        fixture.emitCatalog()
      }))
    })
    fixture.ready()
    expect(await result).toBe('STALE_REVISION')
    expect(mutations).toEqual([])
    expect(fixture.state().value.count).toBe(5)
  }
  finally {
    stop()
    await session.dispose()
  }
})
