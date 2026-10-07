import { describe, expect, it, vi } from 'vitest'
import { createCanvasReplicaSession } from '../../../../histoire-app/src/app/components/canvas/frame-replica.js'
import { createStandaloneSession } from '../../../../histoire-app/src/app/standalone/session.js'
import { getAcceptedHistoireSessionDescriptor, registerHistoireSessionInternals } from '../../../../histoire-sdk/dist/internal.js'
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

  /** Replicas share immutable source metadata while retaining separate session projections. */
  it('shares one accepted descriptor across replicas and keeps session settings isolated', async () => {
    const url = 'https://book.test/nested/book/'
    const fixture = await createEmbedSourceFixture()
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    const canonical = createStandaloneSession({ url, loadDescriptor: async () => descriptor, subscribe: () => () => {} })
    await canonical.connect()
    const accepted = getAcceptedHistoireSessionDescriptor(canonical)
    const first = createCanvasReplicaSession(canonical, url)
    const second = createCanvasReplicaSession(canonical, url)

    try {
      await Promise.all([first.connect(), second.connect()])

      expect(getAcceptedHistoireSessionDescriptor(first)).toBe(accepted)
      expect(getAcceptedHistoireSessionDescriptor(second)).toBe(accepted)
      expect(first.getSnapshot().catalog).not.toBe(second.getSnapshot().catalog)
      await first.settings.update({ colorScheme: 'dark' })
      expect(first.getSnapshot().settings.colorScheme).toBe('dark')
      expect(second.getSnapshot().settings.colorScheme).not.toBe('dark')
    }
    finally {
      await Promise.all([first.dispose(), second.dispose(), canonical.dispose()])
      await fixture.close()
    }
  })

  /** Settings publications must not resolve or clone source metadata again. */
  it('does not reread descriptor metadata for unrelated canonical snapshots', async () => {
    const url = 'https://book.test/nested/book/'
    const fixture = await createEmbedSourceFixture()
    const descriptor = createEmbedSource(fixture.context, fixture.catalog).getDescriptor()
    const canonical = createStandaloneSession({ url, loadDescriptor: async () => descriptor, subscribe: () => () => {} })
    await canonical.connect()
    const accepted = getAcceptedHistoireSessionDescriptor(canonical)
    let descriptorReads = 0
    registerHistoireSessionInternals(canonical, {
      descriptor: () => structuredClone(accepted),
      acceptedDescriptor: () => {
        descriptorReads++
        return accepted
      },
      presets: async () => { throw new Error('Unused test delegate') },
    })
    const replica = createCanvasReplicaSession(canonical, url)

    try {
      expect(descriptorReads).toBe(1)
      await replica.connect()
      await canonical.settings.update({ colorScheme: 'dark' })
      expect(descriptorReads).toBe(1)
    }
    finally {
      await Promise.all([replica.dispose(), canonical.dispose()])
      await fixture.close()
    }
  })

  it('continues rejecting query flags in source book URL', () => {
    expect(() => createStandaloneSession({ url: 'https://book.test/?matrix=true', matrix: true, loadDescriptor: async () => createEmbedDescriptor(), subscribe: () => () => {} })).toThrow()
  })
})
