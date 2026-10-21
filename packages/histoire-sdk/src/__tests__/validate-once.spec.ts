import type { HistoireBridgeIdentity } from '@histoire/protocol'
import type { HistoireSessionNotification } from '../adapters/types.js'
import * as protocol from '@histoire/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createHistoireSessionWithAdapters } from '../session/controller.js'
import { createBridgePort } from '../transport/port.js'
import { markValidatedNotification } from '../transport/validated.js'
import { sourceFixture } from './fixtures/session.js'

// Wrap protocol validators used by SDK modules so SDK-level revalidation can be counted.
vi.mock('@histoire/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@histoire/protocol')>()
  const spy = <T extends (...args: any[]) => any>(fn: T) => vi.fn(fn)
  return {
    ...actual,
    validateBridgeEnvelope: spy(actual.validateBridgeEnvelope),
    validateBridgeEnvelopeBody: spy(actual.validateBridgeEnvelopeBody),
    validateHistoireStateSnapshot: spy(actual.validateHistoireStateSnapshot),
    validateHistoireEvent: spy(actual.validateHistoireEvent),
  }
})

const owner: HistoireBridgeIdentity = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'mount', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'document', target: { storyId: 'a:b', variantId: 'c' } }

/** Lets queued in-memory port deliveries run. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve))
}

describe('single-pass inbound validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates received envelope metadata and body once each', async () => {
    const ports = createEmbedPortPair()
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true })
    const received: HistoireSessionNotification[] = []
    parent.subscribe(value => received.push(value))
    child.post('state.changed', { runtimeId: 'document', target: owner.target, value: { count: 1 } })
    vi.clearAllMocks()
    await flush()
    expect(received.map(value => value.type)).toEqual(['state'])
    expect(protocol.validateBridgeEnvelope).toHaveBeenCalledOnce()
    expect(protocol.validateBridgeEnvelopeBody).toHaveBeenCalledOnce()
    parent.close()
    child.close()
  })

  it('still reports drop for an identified event with invalid payload', async () => {
    const ports = createEmbedPortPair()
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary' })
    const received: HistoireSessionNotification[] = []
    parent.subscribe(value => received.push(value))
    ports.child.start()
    ports.child.postMessage({ ...owner, kind: 'event', event: 'state.changed', sequence: 1, payload: { runtimeId: 'document', target: owner.target, value: null } })
    await flush()
    expect(received).toMatchObject([{ type: 'dropped', stale: true }])
    expect(protocol.validateBridgeEnvelope).toHaveBeenCalledOnce()
    parent.close()
  })

  it('skips payload revalidation only for port-validated notifications', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    await session.mount({} as HTMLElement, { surface: 'preview' }).ready
    const event = { sequence: 1, timestamp: 1, target: { storyId: 'a:b', variantId: 'c' }, runtimeId: 'document-1', payload: {} }
    vi.clearAllMocks()
    for (const receive of fixture.frameListeners) {
      receive(markValidatedNotification({ type: 'state', ...fixture.owner(), state: fixture.state() }))
      receive(markValidatedNotification({ type: 'event', ...fixture.owner(), event }))
    }
    expect(protocol.validateHistoireStateSnapshot).not.toHaveBeenCalled()
    expect(protocol.validateHistoireEvent).not.toHaveBeenCalled()
    for (const receive of fixture.frameListeners) {
      receive({ type: 'state', ...fixture.owner(), state: fixture.state() })
      receive({ type: 'event', ...fixture.owner(), event: { ...event, sequence: 2 } })
    }
    expect(protocol.validateHistoireStateSnapshot).toHaveBeenCalledOnce()
    expect(protocol.validateHistoireEvent).toHaveBeenCalledOnce()
    expect(session.getSnapshot().events.items).toHaveLength(2)
    await session.dispose()
  })
})
