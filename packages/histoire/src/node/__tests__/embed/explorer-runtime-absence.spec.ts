import type { HistoireMountContext } from '../../../../../histoire-sdk/src/adapters/types.js'
import { expect, it, vi } from 'vitest'
import { createExplorerViewSession } from '../../../../../histoire-app/src/embed/adapters/explorer-session.js'
import { sourceFixture } from '../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../../histoire-sdk/src/internal.js'
import { createBridgePort } from '../../../../../histoire-sdk/src/transport/port.js'
import { createEmbedPortPair } from '../utils/embed/transport.js'

const mount = vi.hoisted(() => vi.fn())
vi.mock('../../../../../histoire-app/src/embed/adapters/local-mount.js', () => ({ mountLocalHistoireSurface: mount }))

it('clears outer runtime envelope identity when Explorer inner primary becomes absent', async () => {
  const fixture = sourceFixture()
  mount.mockImplementation((context: HistoireMountContext) => fixture.adapters.mount!(context))
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const ports = createEmbedPortPair()
  const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'outer', mountId: 'outer', sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision, runtimeId: 'old-document', target: session.getSnapshot().selection! }
  const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
  const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true })
  const explorer = createExplorerViewSession({ session, bridge: child, descriptor: fixture.descriptor, signal: new AbortController().signal, sourceBase: 'https://book.test/', container: undefined! })
  try {
    const inner = explorer.session.mount(undefined!, { surface: 'preview' })
    await inner.ready
    await inner.unmount()
    await Promise.resolve()
    expect(parent.getOwner().runtimeId).toBeUndefined()
    expect(parent.getOwner().target).toEqual(owner.target)
    expect(ports.child.sent).toContainEqual(expect.objectContaining({ kind: 'event', event: 'readiness.changed', runtimeId: undefined, payload: { runtime: { status: 'absent', mountId: owner.mountId, runtimeId: null, layout: null, viewports: [], viewport: null } } }))
  }
  finally {
    await explorer.close()
    parent.close()
    child.close()
    await session.dispose()
  }
})
