import { expect, it } from 'vitest'
import { createEmbedPortPair } from '../../../histoire/src/node/__tests__/utils/embed/transport.js'
import { createBridgePort } from '../transport/port.js'
import { deferred } from './fixtures/session.js'

/** Source metadata stays readable while physical document remains retired. */
const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'preview', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'document', target: { storyId: 'a:b', variantId: 'c' } }
const runtime = { status: 'failed', mountId: owner.mountId, runtimeId: owner.runtimeId, layout: 'single', viewports: [], viewport: null }

it.each(['docs.get', 'source.get'] as const)('preserves pending and fresh %s metadata through document retirement', async (command) => {
  const ports = createEmbedPortPair()
  const held = deferred<unknown>()
  const result = command === 'docs.get'
    ? { storyId: 'a:b', epoch: owner.epoch, revision: owner.revision, origin: 'sibling', format: 'html', body: '<p>Docs</p>' }
    : { storyId: 'a:b', epoch: owner.epoch, revision: owner.revision, origin: 'file', mode: 'raw', body: 'source' }
  const payload = command === 'docs.get' ? { storyId: 'a:b' } : { storyId: 'a:b', mode: 'raw' }
  const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'primary', dispatch: () => result })
  const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'primary', child: true, dispatch: () => held.promise })
  const capture = { ...owner, signal: new AbortController().signal }
  try {
    const pending = parent.request(command, payload, capture)
    child.post('readiness.changed', { runtime })
    await Promise.resolve()
    held.resolve(result)
    await expect(pending).resolves.toEqual(result)
    await expect(parent.request(command, payload, capture)).resolves.toEqual(result)
    await expect(child.request(command, payload, capture)).resolves.toEqual(result)
    // Metadata exception never authorizes retired runtime execution or UI intent.
    for (const [blocked, payload] of [['state.get', {}], ['source.get', { storyId: 'a:b', mode: 'dynamic' }], ['tests.run', { mode: 'preview' }], ['selection.select', { storyId: 'a:b', variantId: 'other' }]] as const) {
      expect(() => child.request(blocked, payload, capture)).toThrow('Runtime document retired')
    }
    expect(() => child.request(command, payload, { ...capture, target: { storyId: 'old', variantId: 'old' } })).toThrow('Mismatched runtime target')
  }
  finally {
    held.resolve(result)
    parent.close()
    child.close()
  }
})
