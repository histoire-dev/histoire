// @vitest-environment jsdom
import type { EmbedSurfaceContext } from '../../../../../histoire-app/src/embed/surfaces.js'
import type { HistoireRequestCapture } from '../../../../../histoire-sdk/src/adapters/types.js'
import { MessageChannel } from 'node:worker_threads'
import { expect, it, vi } from 'vitest'
import { mountLocalHistoireSurface } from '../../../../../histoire-app/src/embed/adapters/local-mount.js'
import { registerEmbedSurface } from '../../../../../histoire-app/src/embed/surfaces.js'
import { deferred, sourceFixture } from '../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../../histoire-sdk/src/internal.js'

// Exercise current source transport, independent of root-owned distribution builds.
vi.mock('../../../../../histoire-sdk/dist/internal.js', async () => import('../../../../../histoire-sdk/src/internal.js'))

/** Real local adapter, controller and native queued ports over shared source fixture. */
async function createLocalSourceFixture() {
  vi.stubGlobal('MessageChannel', MessageChannel)
  const source = sourceFixture()
  let surface!: EmbedSurfaceContext
  const request = vi.fn((_command: string, _payload: unknown, _capture: HistoireRequestCapture): unknown => null)
  const unregister = registerEmbedSurface('preview', (context) => {
    surface = context
    const target = context.session.getSnapshot().selection!
    const runtime = { status: 'ready' as const, mountId: context.bridge.getOwner().mountId, runtimeId: 'local-document', layout: 'single' as const, viewports: [], viewport: null }
    context.bridge.post('readiness.changed', { runtime }, { runtimeId: 'local-document', target })
    return { ready: Promise.resolve(runtime), request, close: () => {} }
  })
  source.adapters.mount = context => mountLocalHistoireSurface(context, 'https://book.test/')
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, source.adapters)
  const container = document.createElement('div')
  document.body.append(container)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const mount = session.mount(container, { surface: 'preview' })
  await mount.ready
  await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'), { timeout: 500 })
  /** Publish canonical descriptor before native catalog event can reach other endpoint. */
  function publish(revision: string) {
    source.descriptor.revision = revision
    source.emitCatalog()
  }
  /** Release native ports before removing registration used by next test. */
  async function close() {
    await session.dispose()
    unregister()
    container.remove()
    vi.unstubAllGlobals()
  }
  return { source, session, surface, request, publish, close }
}

it('admits auto collection at synchronous canonical source revision before queued catalog delivery', async () => {
  const fixture = await createLocalSourceFixture()
  const revisions: string[] = []
  const collections: Promise<unknown>[] = []
  fixture.request.mockImplementation((command, _payload, capture) => {
    if (command === 'tests.collect') {
      revisions.push(capture.revision)
      return { definitions: [] }
    }
    return null
  })
  const stop = fixture.session.subscribe((snapshot) => {
    if (snapshot.source?.revision === 'revision-2' && !collections.length) collections.push(fixture.session.tests.collect())
  })
  try {
    fixture.publish('revision-2')
    expect(collections).toHaveLength(1)
    await expect(collections[0]).resolves.toMatchObject({ definitions: [] })
    expect(revisions).toEqual(['revision-2'])
    expect(fixture.surface.bridge.getOwner().revision).toBe('revision-2')
  }
  finally {
    stop()
    await fixture.close()
  }
})

it('settles predecessor work while duplicate queued catalog preserves newly admitted collection', async () => {
  const fixture = await createLocalSourceFixture()
  const old = deferred<unknown>()
  const current = deferred<unknown>()
  fixture.request.mockImplementation((command, _payload, capture) => command === 'tests.collect' ? capture.revision === 'revision-1' ? old.promise : current.promise : null)
  try {
    const predecessor = fixture.session.tests.collect()
    await vi.waitFor(() => expect(fixture.request).toHaveBeenCalledWith('tests.collect', {}, expect.objectContaining({ revision: 'revision-1' })), { timeout: 500 })
    fixture.publish('revision-2')
    await expect(predecessor).rejects.toMatchObject({ code: 'STALE_REVISION' })
    const successor = fixture.session.tests.collect()
    await vi.waitFor(() => expect(fixture.request).toHaveBeenCalledWith('tests.collect', {}, expect.objectContaining({ revision: 'revision-2' })), { timeout: 500 })
    fixture.surface.bridge.post('catalog.changed', { descriptor: fixture.source.descriptor }, { revision: 'revision-2' })
    // A request/reply round trip drains preceding native source publication.
    await fixture.surface.bridge.request('catalog.list', {}, { ...fixture.surface.bridge.getOwner(), signal: fixture.surface.signal })
    current.resolve({ definitions: [] })
    old.resolve({ definitions: [] })
    await expect(successor).resolves.toMatchObject({ definitions: [] })
  }
  finally {
    old.resolve({ definitions: [] })
    current.resolve({ definitions: [] })
    await fixture.close()
  }
})

it('keeps newest local authority when preceding catalog publications remain queued', async () => {
  const fixture = await createLocalSourceFixture()
  fixture.request.mockImplementation(command => command === 'tests.collect' ? { definitions: [] } : null)
  try {
    fixture.publish('revision-2')
    fixture.publish('revision-3')
    await expect(fixture.session.tests.collect()).resolves.toMatchObject({ definitions: [] })
    expect(fixture.surface.bridge.getOwner().revision).toBe('revision-3')
    expect(fixture.request).toHaveBeenCalledWith('tests.collect', {}, expect.objectContaining({ revision: 'revision-3' }))
  }
  finally { await fixture.close() }
})

it.each(['protocolVersion', 'sessionId', 'connectionId', 'mountId', 'sourceId', 'epoch'] as const)('rejects revision adoption from foreign local %s', async (key) => {
  const fixture = await createLocalSourceFixture()
  fixture.request.mockImplementation(command => command === 'tests.collect' ? { definitions: [] } : null)
  try {
    const bridge = fixture.surface.bridge
    const owner = bridge.getOwner()
    expect(() => bridge.synchronizeSelection(fixture.session.getSnapshot().selection, { ...owner, [key]: key === 'protocolVersion' ? 2 : 'foreign', revision: 'forged' })).toThrow('Mismatched local surface authority')
    expect(bridge.getOwner()).toEqual(owner)
    await expect(fixture.session.tests.collect()).resolves.toMatchObject({ definitions: [] })
  }
  finally { await fixture.close() }
})
