import { describe, expect, it } from 'vitest'
import { createEmbedCyclicState } from '../../../histoire/src/node/__tests__/utils/embed/state.js'
import { validateBridgeEnvelope, validateHistoireSnapshot, validateHistoireSourceDescriptor, validateWireValue } from '../index.js'
import { createProtocolDescriptor, createProtocolSnapshot } from './fixtures/catalog.js'

/** Exact pending request/port owner. */
const owner = { protocolVersion: 1, sessionId: 's', connectionId: 'c', mountId: 'm', sourceId: 'book', epoch: 'epoch', revision: 'revision' }

describe('untrusted result/publication DTOs', () => {
  it('requires successful result to match captured command before use', () => {
    const reply = { ...owner, kind: 'response', requestId: 'r', ok: true, result: createProtocolDescriptor().catalog.stories }
    expect(() => validateBridgeEnvelope(reply, owner, 'data', 'catalog.list')).not.toThrow()
    expect(() => validateBridgeEnvelope(reply, owner, 'data')).toThrow()
    expect(() => validateBridgeEnvelope({ ...reply, result: [{ id: 'forged' }] }, owner, 'data', 'catalog.list')).toThrow()
    expect(() => validateBridgeEnvelope({ ...reply, result: { storyId: 'x', body: '<p>x</p>' } }, owner, 'data', 'docs.get')).toThrow()
    expect(() => validateBridgeEnvelope({ ...reply, result: { definitions: [{ id: 'x', handler: true }] } }, owner, 'primary', 'tests.collect')).toThrow()
  })

  it('validates catalog, events and runtime events instead of trusting child data', () => {
    const publication = { ...owner, kind: 'event', sequence: 1, event: 'catalog.changed', payload: { descriptor: createProtocolDescriptor() } }
    expect(() => validateBridgeEnvelope(publication, owner, 'data')).not.toThrow()
    for (const [event, payload] of [
      ['catalog.changed', { descriptor: { sourceId: 'forged' } }],
      ['events.appended', { items: [{ payload: 'x' }] }],
      ['readiness.changed', { runtime: { status: 'ready' } }],
      ['layout.changed', { viewports: [{ x: 0, y: 0, width: 100, height: 100 }] }],
      ['focus.changed', { focused: 'yes' }],
    ]) expect(() => validateBridgeEnvelope({ ...publication, event, payload }, owner, 'primary')).toThrow()
  })

  it('requires complete descriptors/view snapshots and supports cyclic state field', () => {
    const descriptor = createProtocolDescriptor()
    expect(validateHistoireSourceDescriptor(descriptor)).toBe(descriptor)
    const snapshot = createProtocolSnapshot()
    const state = createEmbedCyclicState()
    snapshot.state = { target: { storyId: 'a:b', variantId: 'c' }, runtimeId: 'runtime', value: state }
    expect(validateHistoireSnapshot(snapshot)).toBe(snapshot)
    expect(() => validateHistoireSnapshot({ ...snapshot, settings: {} })).toThrow()
    expect(() => validateHistoireSourceDescriptor({ ...descriptor, capabilities: {} })).toThrow()
    const story = descriptor.catalog.stories[0]
    expect(() => validateHistoireSourceDescriptor({ ...descriptor, catalog: { ...descriptor.catalog, stories: [{ ...story, relativePath: '/private/secret.story.vue' }] } })).toThrow()
  })

  it('keeps errors JSON-safe even when command transports cyclic state', () => {
    const details = createEmbedCyclicState()
    expect(() => validateWireValue({ code: 'TIMEOUT', message: 'x', details }, { kind: 'error', name: 'state.get' })).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }))
    const input = { ...owner, protocolVersion: 2, kind: 'request', requestId: 'r', command: 'catalog.list', payload: {} }
    expect(() => validateBridgeEnvelope(input, { ...owner, protocolVersion: 2 }, 'data')).not.toThrow()
    expect(() => validateBridgeEnvelope(input, owner, 'data')).toThrow()
  })

  it('accepts completed revision advance only on same bound catalog/content stream', () => {
    const descriptor = createProtocolDescriptor()
    descriptor.revision = 'revision-next'
    const message = { ...owner, revision: descriptor.revision, kind: 'event', sequence: 2, event: 'catalog.changed', payload: { descriptor } }
    expect(() => validateBridgeEnvelope(message, owner, 'data')).not.toThrow()
    expect(() => validateBridgeEnvelope({ ...message, epoch: 'other' }, owner, 'data')).toThrow()
    expect(() => validateBridgeEnvelope({ ...message, payload: { descriptor: { ...descriptor, revision: 'different' } } }, owner, 'data')).toThrow()
    expect(() => validateBridgeEnvelope({ ...message, event: 'content.changed', payload: { storyIds: ['a:b'] } }, owner, 'data')).not.toThrow()
    expect(() => validateBridgeEnvelope({ ...message, event: 'settings.changed', payload: { colorScheme: 'dark' } }, owner, 'primary')).toThrow()
  })
})
