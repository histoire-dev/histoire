// @vitest-environment jsdom
import type { HistoireBridgeAck, HistoireBridgePublication, HistoireRuntimeSnapshot, HistoireTarget } from '@histoire/protocol'
import type { EmbedSurfaceContext } from '../../../../../histoire-app/src/embed/surfaces.js'
import { HistoireSdkError } from '@histoire/protocol'
import { expect, it, vi } from 'vitest'
import { installEmbedHandshake } from '../../../../../histoire-app/src/embed/handshake.js'
import { registerEmbedSurface } from '../../../../../histoire-app/src/embed/surfaces.js'
import { deferred, sourceFixture } from '../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createBridgePort } from '../../../../../histoire-sdk/src/transport/port.js'
import { createEmbedSnapshot } from '../utils/embed/catalog.js'
import { createEmbedPortPair } from '../utils/embed/transport.js'

/** Real finite handshake/ports with deferred first surface readiness. */
async function createHandshake() {
  const fixture = sourceFixture()
  const ports = createEmbedPortPair()
  const first = deferred<HistoireRuntimeSnapshot>()
  let context: EmbedSurfaceContext | undefined
  const events = new EventTarget()
  const parentOrigin = window.location.origin
  const childWindow = {
    parent: window,
    document,
    location: new URL(`__embed.html?view=surface&surface=preview&parentOrigin=${encodeURIComponent(parentOrigin)}&sessionId=session&mountId=mount`, window.location.href),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as Window
  /** Each document status carries exact current mount identity. */
  const runtime = (runtimeId: string | null, status: HistoireRuntimeSnapshot['status']): HistoireRuntimeSnapshot => ({ status, runtimeId, mountId: 'mount', layout: 'single', viewports: [], viewport: null })
  const unregister = registerEmbedSurface('preview', (value) => {
    context = value
    value.bridge.post('readiness.changed', { runtime: runtime('document-1', 'mounting') }, { runtimeId: 'document-1', target: value.session.getSnapshot().selection! })
    return { ready: first.promise, close: vi.fn() }
  })
  const lifecycle = installEmbedHandshake(Promise.resolve({ ...fixture.connection, allowedOrigins: [] }), childWindow)
  events.dispatchEvent(new MessageEvent('message', { source: window, origin: parentOrigin, ports: [ports.child as unknown as MessagePort], data: { kind: 'histoire:hello', protocolRange: { min: 1, max: 1 }, nonce: 'nonce', sessionId: 'session', mountId: 'mount', parentOrigin, role: 'primary' } }))
  await vi.waitFor(() => expect(ports.child.sent[0]).toMatchObject({ kind: 'histoire:ack', ok: true }))
  const ack = ports.child.sent[0] as HistoireBridgeAck & { ok: true }
  const bridge = createBridgePort({ port: ports.parent as unknown as MessagePort, owner: ack.owner, role: 'primary', descriptor: fixture.descriptor })
  const snapshot = { ...createEmbedSnapshot(), source: { ...createEmbedSnapshot().source!, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision } }
  /** Parent view synchronization advances target before surface observers act. */
  function sync(target: HistoireTarget) {
    return bridge.request('view.sync', { ...snapshot, selection: target }, { ...bridge.getOwner(), signal: lifecycle.signal })
  }
  const initial = sync({ storyId: 'a:b', variantId: 'c' }).catch(error => error.code)
  await vi.waitFor(() => expect(context).toBeDefined())
  /** Observe source-side publications, including ones parent would reject as obsolete. */
  function publications() {
    return (ports.child.sent as HistoireBridgePublication[]).filter(event => event.event === 'readiness.changed')
  }
  /** Close registered document and both endpoints before next handshake test. */
  async function close() {
    first.reject(new HistoireSdkError('RUNTIME_CHANGED', 'Fixture closed'))
    await initial
    await lifecycle.close()
    bridge.close()
    unregister()
  }
  return { first, context: context!, runtime, initial, sync, publications, close }
}

it('does not publish failure when initial readiness retires into docs', async () => {
  const fixture = await createHandshake()
  try {
    const target = { storyId: 'docs', variantId: null }
    await fixture.sync(target)
    fixture.context.bridge.post('readiness.changed', { runtime: fixture.runtime(null, 'absent') }, { runtimeId: undefined, target })
    fixture.first.reject(new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document retired'))
    await fixture.initial
    expect(fixture.publications().map(event => (event.payload as { runtime: HistoireRuntimeSnapshot }).runtime.status)).toEqual(['mounting', 'absent'])
  }
  finally { await fixture.close() }
})

it.each(['ready', 'error'])('ignores obsolete initial %s completion after replacement', async (outcome) => {
  const fixture = await createHandshake()
  try {
    const target = { storyId: 'a:b', variantId: 'other' }
    await fixture.sync(target)
    fixture.context.bridge.post('readiness.changed', { runtime: fixture.runtime('document-2', 'mounting') }, { runtimeId: 'document-2', target })
    if (outcome === 'ready') fixture.first.resolve(fixture.runtime('document-1', 'ready'))
    else fixture.first.reject(new Error('Retired failure'))
    await fixture.initial
    expect(fixture.publications().map(event => (event.payload as { runtime: HistoireRuntimeSnapshot }).runtime)).toEqual([fixture.runtime('document-1', 'mounting'), fixture.runtime('document-2', 'mounting')])
  }
  finally { await fixture.close() }
})

it('publishes genuine initial failure against captured document', async () => {
  const fixture = await createHandshake()
  try {
    fixture.first.reject(new Error('Broken initial story'))
    await fixture.initial
    expect(fixture.publications().at(-1)).toMatchObject({ runtimeId: 'document-1', target: { storyId: 'a:b', variantId: 'c' }, payload: { runtime: { status: 'failed', runtimeId: 'document-1' } } })
  }
  finally { await fixture.close() }
})
