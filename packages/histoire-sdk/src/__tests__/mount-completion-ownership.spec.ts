import type { HistoireRuntimeSnapshot } from '@histoire/protocol'
import { expect, it } from 'vitest'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createHistoireSessionWithAdapters } from '../internal.js'
import { waitBridgeRuntime } from '../mounts/handle.js'
import { createBridgePort } from '../transport/port.js'
import { sourceFixture } from './fixtures/session.js'

it.each(['epoch', 'revision'] as const)('cannot publish late mount readiness or settings after source %s changes', async (field) => {
  const fixture = sourceFixture()
  const ports = createEmbedPortPair()
  const abort = new AbortController()
  let child: ReturnType<typeof createBridgePort>
  let oldRuntime: HistoireRuntimeSnapshot
  fixture.adapters.mount = (capture) => {
    const owner = { protocolVersion: 1, sessionId: capture.sessionId, connectionId: 'surface-connection', mountId: capture.mountId, sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, target: capture.target! }
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true })
    oldRuntime = { status: 'ready', mountId: capture.mountId, runtimeId: 'old-source-document', layout: 'single', viewports: [], viewport: null }
    return {
      id: owner.connectionId,
      ready: waitBridgeRuntime(parent, abort.signal, 2_000),
      subscribe: parent.subscribe,
      request: fixture.connection.request,
      /** Teardown owns both endpoints even after SDK readiness rejects. */
      close() {
        abort.abort()
        parent.close()
        child.close()
      },
    }
  }
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  try {
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const primary = session.mount({} as HTMLElement, { surface: 'preview' })
    await Promise.resolve()
    fixture.descriptor[field] = 'replacement-source'
    fixture.emitCatalog()
    await expect(primary.ready).rejects.toMatchObject({ code: 'STALE_REVISION' })
    // Data and surface ports deliver independently. SDK notification rejects this
    // old publication, but the surface readiness waiter still resolves with it.
    child!.post('readiness.changed', { runtime: oldRuntime! }, { runtimeId: oldRuntime!.runtimeId! })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(session.getSnapshot().source?.[field]).toBe('replacement-source')
    expect(session.getSnapshot().runtime.runtimeId).toBeNull()
    expect(session.getSnapshot().runtime.status).not.toBe('ready')
    expect(fixture.request).not.toHaveBeenCalled()
  }
  finally { await session.dispose() }
})
