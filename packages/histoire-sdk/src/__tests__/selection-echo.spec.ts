import { wireRecord } from '@histoire/protocol'
import { expect, it } from 'vitest'
import { createParentViewSession } from '../../../histoire-app/src/embed/view-session.js'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { createBridgePort } from '../transport/port.js'
import { dispatchHistoireSessionCommand } from '../transport/session-commands.js'
import { sourceFixture } from './fixtures/session.js'

it('preserves accepted child selection ACK through normalized parent snapshot echo', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
  await session.connect()
  const ports = createEmbedPortPair()
  const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'view', mountId: 'view', sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision }
  const signal = new AbortController().signal
  let view: ReturnType<typeof createParentViewSession>
  const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'view', dispatch: request => dispatchHistoireSessionCommand(session, request.command, request.payload, request) })
  const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'view', child: true, dispatch: (request) => {
    view.synchronize(request.payload as any)
    return null
  } })
  view = createParentViewSession(child, signal)
  const synchronize = () => parent.request('view.sync', session.getSnapshot(), { ...parent.getOwner(), signal })
  const off = session.subscribe(() => {
    void synchronize().catch(() => {})
  })
  try {
    await synchronize()
    // Omitted variant becomes parent default/remembered variant, not raw input tuple.
    for (const input of [{ storyId: 'a:b' }, { storyId: 'a:b', variantId: 'other' }, { storyId: 'docs' }]) {
      await expect(view.session.selection.select(input)).resolves.toBeNull()
      expect(view.session.getSnapshot().selection).toEqual(session.getSnapshot().selection)
      const intent = ports.child.sent.map(wireRecord).filter(envelope => envelope.kind === 'request' && envelope.command === 'selection.select').at(-1)!
      expect(ports.parent.sent.map(wireRecord).some(envelope => envelope.command === 'view.sync' && envelope.selectionRequestId === intent.requestId)).toBe(true)
    }
    expect(session.getSnapshot().selection).toEqual({ storyId: 'docs', variantId: null })
    for (const envelope of [...ports.parent.sent, ...ports.child.sent].map(wireRecord)) {
      if (envelope.kind === 'response') expect(envelope).not.toHaveProperty('selectionRequestId')
    }
  }
  finally {
    off()
    view.close()
    parent.close()
    child.close()
    await session.dispose()
  }
})
