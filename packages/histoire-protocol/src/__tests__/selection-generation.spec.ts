import { describe, expect, it } from 'vitest'
import { validateBridgeEnvelope, validateHistoireAck, validateHistoireHello } from '../index.js'
import { createProtocolDescriptor, createProtocolSnapshot } from './fixtures/catalog.js'

/** Captured predecessor target remains distinct from requested next target. */
const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'view', sourceId: 'book', epoch: 'epoch', revision: 'revision', selectionVersion: 2, target: { storyId: 'story', variantId: 'selected' } }
const request = { ...owner, kind: 'request', requestId: 'intent', command: 'selection.select', payload: { storyId: 'story', variantId: 'next' } }

describe('bridge selection generation', () => {
  it('requires current generation on child intent after generation is established', () => {
    expect(() => validateBridgeEnvelope(request, owner, 'view', undefined, 'child-to-parent')).not.toThrow()
    for (const selectionVersion of [undefined, 1, 3, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateBridgeEnvelope({ ...request, selectionVersion }, owner, 'view', undefined, 'child-to-parent')).toThrow()
    }
  })

  it('preserves legacy absent generation and captured parent replacement replies', () => {
    const legacy = { ...owner, selectionVersion: undefined }
    expect(() => validateBridgeEnvelope({ ...request, selectionVersion: undefined }, legacy, 'view', undefined, 'child-to-parent')).not.toThrow()
    expect(() => validateBridgeEnvelope(request, owner, 'primary')).not.toThrow()
    const { command: _command, payload: _payload, ...captured } = request
    expect(() => validateBridgeEnvelope({ ...captured, kind: 'response', ok: true, result: null }, owner, 'primary', 'selection.select', 'child-to-parent')).not.toThrow()
    expect(() => validateBridgeEnvelope({ ...captured, selectionVersion: 1, kind: 'response', ok: true, result: null }, owner, 'primary', 'selection.select', 'child-to-parent')).toThrow()
  })

  it('permits selection correlation only on parent view sync requests', () => {
    const sync = { ...owner, kind: 'request', requestId: 'sync', command: 'view.sync', payload: createProtocolSnapshot(), selectionRequestId: request.requestId }
    expect(() => validateBridgeEnvelope(sync, owner, 'view')).not.toThrow()
    for (const selectionRequestId of ['', 1, null]) {
      expect(() => validateBridgeEnvelope({ ...sync, selectionRequestId }, owner, 'view')).toThrow()
    }
    expect(() => validateBridgeEnvelope(sync, owner, 'view', undefined, 'child-to-parent', true)).toThrow()
    expect(() => validateBridgeEnvelope({ ...request, selectionRequestId: request.requestId }, owner, 'view', undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope({ ...sync, command: 'catalog.getStory', payload: { storyId: 'story' } }, owner, 'data')).toThrow()
    expect(() => validateBridgeEnvelope({ ...owner, kind: 'event', event: 'layout.changed', sequence: 1, payload: { viewports: [] }, selectionRequestId: request.requestId }, owner, 'view')).toThrow()
    expect(() => validateBridgeEnvelope({ ...owner, kind: 'response', requestId: 'sync', ok: true, result: null, selectionRequestId: request.requestId }, owner, 'view', 'view.sync')).toThrow()
  })

  it('validates optional initial generation on negotiated owner', () => {
    const hello = { kind: 'histoire:hello', nonce: 'nonce', protocolRange: { min: 1, max: 1 }, sessionId: owner.sessionId, mountId: owner.mountId, parentOrigin: 'https://host.test', role: 'view' } as const
    const { target: _target, ...initial } = owner
    const ack = { kind: 'histoire:ack', nonce: hello.nonce, protocolRange: hello.protocolRange, ok: true, owner: initial, descriptor: createProtocolDescriptor() }
    expect(() => validateHistoireAck(ack, hello)).not.toThrow()
    expect(() => validateHistoireAck({ ...ack, owner: { ...initial, selectionVersion: -1 } }, hello)).toThrow()
    expect(() => validateHistoireHello({ ...hello, selectionRequestId: 'intent' })).toThrow()
    expect(() => validateHistoireAck({ ...ack, owner: { ...initial, selectionRequestId: 'intent' } }, hello)).toThrow()
    expect(() => validateHistoireAck({ ...ack, selectionRequestId: 'intent' }, hello)).toThrow()
  })
})
