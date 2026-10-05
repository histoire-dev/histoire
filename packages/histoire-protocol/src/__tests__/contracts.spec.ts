import { describe, expect, it } from 'vitest'
import { getHistoireTargetKey, validateBridgeEnvelope, validateEmbedOrigin, validateSettingsPatch } from '../index.js'

/** Bound data port used by all envelope scenarios. */
const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'bridge', sourceId: 'book', epoch: 'epoch', revision: 'revision' }

describe('portable trust boundary', () => {
  it('preserves exact tuple IDs that collide under colon concatenation', () => {
    expect(getHistoireTargetKey({ storyId: 'a:b', variantId: 'c' })).not.toBe(getHistoireTargetKey({ storyId: 'a', variantId: 'b:c' }))
  })
  it('accepts HTTP(S) exact origins and rejects wildcard, opaque and URL credentials/paths', () => {
    expect(validateEmbedOrigin('http://localhost:8080')).toBe('http://localhost:8080')
    for (const value of ['*', 'null', 'https://a.test/path', 'https://u:p@a.test', 'https://a.test?x', 'file:///tmp']) {
      expect(() => validateEmbedOrigin(value)).toThrow()
    }
  })
  it('rejects invalid settings and prototype mutation before dispatch', () => {
    expect(validateSettingsPatch({ responsiveHeight: null, globals: { theme: 'dark' } })).toEqual({ responsiveHeight: null, globals: { theme: 'dark' } })
    for (const value of [{ responsiveWidth: Infinity }, { colorScheme: 'blue' }, { globals: { 'bad key': true } }, JSON.parse('{"__proto__":{}}')]) {
      expect(() => validateSettingsPatch(value)).toThrow()
    }
  })
  it('validates command, payload, version and owner before accepting envelope', () => {
    const message = { ...owner, kind: 'request', requestId: 'request', command: 'catalog.getStory', payload: { storyId: 'colon:story' } }
    expect(validateBridgeEnvelope(message, owner, 'data')).toEqual(message)
    for (const change of [{ command: 'eval' }, { protocolVersion: 2 }, { sessionId: 'other' }, { payload: { storyId: 1 } }]) {
      expect(() => validateBridgeEnvelope({ ...message, ...change }, owner, 'data')).toThrow()
    }
    expect(() => validateBridgeEnvelope({ ...message, command: 'state.get', payload: {} }, owner, 'data')).toThrow()
    expect(() => validateBridgeEnvelope({ ...owner, kind: 'response', requestId: 'r', ok: false, error: { code: 'TIMEOUT', message: 'x', details: { text: 'x'.repeat(16_384) } } }, owner, 'data')).toThrow()
  })
  it('allows channel origin inside grid payload only on exact primary document port', () => {
    const primary = { ...owner, runtimeId: 'document', target: { storyId: 'story', variantId: 'selected' } }
    const payload = { name: 'factory', type: 'application', data: { command: 'selection.select' }, runtimeId: 'document', target: { storyId: 'story', variantId: 'other' } }
    const event = { ...primary, kind: 'event', event: 'channel.message', sequence: 1, payload }
    expect(() => validateBridgeEnvelope(event, primary, 'primary', undefined, 'child-to-parent')).not.toThrow()
    for (const role of ['data', 'controls', 'view'] as const) expect(() => validateBridgeEnvelope(event, primary, role, undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope(event, primary, 'primary')).toThrow()
    expect(() => validateBridgeEnvelope({ ...event, payload: { ...payload, runtimeId: 'old' } }, primary, 'primary', undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope({ ...event, payload: { ...payload, target: { storyId: 'different', variantId: 'other' } } }, primary, 'primary', undefined, 'child-to-parent')).toThrow()
  })
})
