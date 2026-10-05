import { describe, expect, it, vi } from 'vitest'
import { createCanvasReplicaSession } from '../../../../histoire-app/src/app/components/canvas/frame-replica.js'
import { createStandaloneSession } from '../../../../histoire-app/src/app/standalone/session.js'
import { createEmbedSource } from '../virtual/embed/source.js'
import { createEmbedDescriptor } from './utils/embed/catalog.js'
import { createEmbedSourceFixture } from './utils/embed/source.js'

/** Only DOM attachment is replaced; real source connection and SDK URL validation run. */
const mount = vi.hoisted(() => vi.fn(() => ({ id: 'local', ready: Promise.resolve(), request: async () => null, subscribe: () => () => {}, close: () => {} })))
vi.mock('../../../../histoire-app/src/embed/adapters/local-mount.js', () => ({ mountLocalHistoireSurface: mount }))

describe('matrix replica URL ownership', () => {
  it.each([false, true])('keeps source book URL clean with matrix mode %s', async (matrix) => {
    const url = 'https://book.test/nested/book/'
    const fixture = await createEmbedSourceFixture()
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    const canonical = createStandaloneSession({ url, loadDescriptor: async () => descriptor, subscribe: () => () => {} })
    await canonical.connect()
    const replica = createCanvasReplicaSession(canonical, url, { matrix })
    try {
      await replica.connect()
      expect(replica.getSnapshot().source?.url).toBe(url)
      const handle = replica.mount({} as HTMLElement, { surface: 'preview' })
      await handle.ready
      expect(mount).toHaveBeenLastCalledWith(expect.any(Object), matrix ? `${url}?matrix=true` : url, true)
    }
    finally {
      await replica.dispose()
      await canonical.dispose()
      await fixture.close()
    }
  })

  it('continues rejecting query flags in source book URL', () => {
    expect(() => createStandaloneSession({ url: 'https://book.test/?matrix=true', matrix: true, loadDescriptor: async () => createEmbedDescriptor(), subscribe: () => () => {} })).toThrow()
  })
})
