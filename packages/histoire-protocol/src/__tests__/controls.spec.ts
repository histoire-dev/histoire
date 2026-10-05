import { describe, expect, it } from 'vitest'
import { validateBridgeEnvelope } from '../bridge/envelope.js'
import { validateBridgeEventPayload } from '../bridge/events.js'
import { validateBridgePayload } from '../bridge/payload.js'
import { validateBridgeResult } from '../bridge/results.js'

/** Finite controls intents cannot acquire execution authority through data/view ports. */
const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'mount', sourceId: 'source', epoch: 'epoch', revision: 'revision', runtimeId: 'runtime', target: { storyId: 'story', variantId: 'variant' } }

describe('controls bridge authority', () => {
  it('allows only current child primary focus/search and bounded event reset publications', () => {
    const focus = { ...owner, kind: 'event', sequence: 1, event: 'focus.changed', payload: { focused: true, action: 'search' } }
    expect(() => validateBridgeEnvelope(focus, owner, 'primary', undefined, 'child-to-parent')).not.toThrow()
    expect(() => validateBridgeEnvelope(focus, owner, 'primary')).toThrow()
    expect(() => validateBridgeEnvelope({ ...focus, runtimeId: 'old' }, owner, 'primary', undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope({ ...focus, payload: { focused: true, action: 'execute' } }, owner, 'primary', undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope({ ...focus, payload: { focused: true, direction: 'next' } }, owner, 'primary', undefined, 'child-to-parent')).toThrow()
    const events = { ...owner, kind: 'event', sequence: 2, event: 'events.appended', payload: { items: [], reset: true } }
    expect(() => validateBridgeEnvelope(events, owner, 'view')).not.toThrow()
    expect(() => validateBridgeEnvelope({ ...events, payload: { items: [], reset: 'yes' } }, owner, 'view')).toThrow()
  })
  it('allows only configured presentation and finite primary-owned preset intents', () => {
    const configure = { ...owner, kind: 'request', requestId: 'configure', command: 'controls.configure', payload: { customOnly: true } }
    expect(() => validateBridgeEnvelope(configure, owner, 'controls')).not.toThrow()
    expect(() => validateBridgeEnvelope(configure, owner, 'controls', undefined, 'child-to-parent')).toThrow()
    const preset = { ...owner, kind: 'request', requestId: 'preset', command: 'controls.preset', payload: { action: 'save', label: 'Saved' } }
    expect(() => validateBridgeEnvelope(preset, owner, 'primary')).not.toThrow()
    expect(() => validateBridgeEnvelope(preset, owner, 'controls', undefined, 'child-to-parent')).not.toThrow()
    const reset = { ...preset, command: 'state.reset', payload: {} }
    expect(() => validateBridgeEnvelope(reset, owner, 'controls', undefined, 'child-to-parent')).not.toThrow()
    expect(() => validateBridgeEnvelope(reset, owner, 'controls')).toThrow()
    for (const role of ['controls', 'data', 'view'] as const) expect(() => validateBridgeEnvelope(preset, owner, role)).toThrow()
    for (const payload of [{ action: 'run', code: 'alert(1)' }, { action: 'save', label: ' ' }, { action: 'list', id: 'unowned' }, { action: 'apply' }]) expect(() => validateBridgePayload('controls.preset', payload)).toThrow()
    expect(() => validateBridgeResult('controls.preset', { items: [{ id: 'id', label: 'Saved', value: {} }] })).toThrow()
  })

  it('accepts finite option availability and rejects malformed or executable item data', () => {
    const payload = { id: 'menu', anchor: { x: 0, y: 0, width: 34, height: 34 }, overlay: { kind: 'select', items: [{ id: 'one', label: 'One', disabled: true }] } }
    expect(() => validateBridgeEventPayload('overlay.open', payload)).not.toThrow()
    for (const item of [{ id: 'one', label: 'One', disabled: 'yes' }, { id: 'one', label: 'One', value: 1 }]) {
      expect(() => validateBridgeEventPayload('overlay.update', { ...payload, overlay: { ...payload.overlay, items: [item] } })).toThrow()
    }
  })

  it('relays opaque results only into current controls owner', () => {
    const event = { ...owner, kind: 'event', sequence: 1, event: 'overlay.result', payload: { id: 'menu', itemId: 'opaque-option', restoreFocus: true } }
    expect(() => validateBridgeEnvelope(event, owner, 'controls')).not.toThrow()
    expect(() => validateBridgeEnvelope(event, owner, 'controls', undefined, 'child-to-parent')).toThrow()
    expect(() => validateBridgeEnvelope(event, owner, 'primary')).toThrow()
    expect(() => validateBridgeEnvelope({ ...event, runtimeId: 'old-runtime' }, owner, 'controls')).toThrow()
    expect(() => validateBridgeEnvelope({ ...event, payload: { ...event.payload, value: { callback: 'bad' } } }, owner, 'controls')).toThrow()
  })
})
