import type { HistoireWirePolicy } from '../bridge/limits.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBridgeEnvelope, validateBridgeEnvelopeBody } from '../bridge/envelope.js'
import { measureWireValue, validateWireValue } from '../bridge/size.js'
import { createProtocolSnapshot } from './fixtures/catalog.js'

// Wrap exported sizing entry points so cross-module traversals can be counted.
vi.mock('../bridge/size.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bridge/size.js')>()
  return { ...actual, measureWireValue: vi.fn(actual.measureWireValue), validateWireValue: vi.fn(actual.validateWireValue) }
})

const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'mount', sourceId: 'book', epoch: 'epoch', revision: 'revision', runtimeId: 'runtime', target: { storyId: 'story', variantId: 'variant' } }

/**
 * Counts `validateWireValue` traversals per policy.
 * @returns Map from `kind:name` to call count.
 */
function policyCalls(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [, policy] of vi.mocked(validateWireValue).mock.calls as [unknown, HistoireWirePolicy][]) {
    const key = `${policy.kind}:${policy.name}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

describe('bridge envelope single-pass validation', () => {
  beforeEach(() => {
    vi.mocked(validateWireValue).mockClear()
    vi.mocked(measureWireValue).mockClear()
  })

  it('measures metadata and state publication payload once', () => {
    const state = { runtimeId: 'runtime', target: owner.target, value: { count: 1 } }
    validateBridgeEnvelope({ ...owner, kind: 'event', event: 'state.changed', sequence: 1, payload: state }, owner, 'primary', undefined, 'child-to-parent')
    expect(policyCalls()).toEqual({ 'metadata:': 1, 'event:state.changed': 1 })
  })

  it('measures view sync snapshot once', () => {
    const { runtimeId: _runtimeId, target: _target, ...view } = owner
    validateBridgeEnvelope({ ...view, kind: 'request', requestId: 'sync', command: 'view.sync', payload: createProtocolSnapshot() }, view, 'view')
    expect(policyCalls()).toEqual({ 'metadata:': 1, 'request:view.sync': 1 })
  })

  it('does not remeasure story event payloads already covered by the batch', () => {
    const item = { sequence: 1, timestamp: 1, target: owner.target, runtimeId: 'runtime', payload: { name: 'click' } }
    validateBridgeEnvelope({ ...owner, kind: 'event', event: 'events.appended', sequence: 1, payload: { items: [item] } }, owner, 'view')
    expect(policyCalls()).toEqual({ 'metadata:': 1, 'event:events.appended': 1 })
    expect(measureWireValue).not.toHaveBeenCalled()
  })

  it('splits metadata and body phases without repeating metadata', () => {
    const envelope = { ...owner, kind: 'event', event: 'layout.changed', sequence: 1, payload: { viewports: [] } }
    validateBridgeEnvelope(envelope, owner, 'primary', undefined, 'child-to-parent', true)
    validateBridgeEnvelopeBody(envelope, 'primary', undefined, 'child-to-parent')
    expect(policyCalls()).toEqual({ 'metadata:': 1, 'event:layout.changed': 1 })
  })

  it('keeps payload rejections in body phase', () => {
    const envelope = { ...owner, kind: 'event', event: 'state.changed', sequence: 1, payload: { runtimeId: 'runtime', target: owner.target, value: { text: 'x'.repeat(2 * 1024 * 1024) } } }
    expect(() => validateBridgeEnvelope(envelope, owner, 'primary', undefined, 'child-to-parent', true)).not.toThrow()
    expect(() => validateBridgeEnvelopeBody(envelope, 'primary', undefined, 'child-to-parent')).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }))
  })
})
