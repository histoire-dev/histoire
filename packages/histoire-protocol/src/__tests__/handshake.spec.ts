import { describe, expect, it } from 'vitest'
import { createEmbedDescriptor } from '../../../histoire/src/node/__tests__/utils/embed/catalog.js'
import { validateBridgeEnvelope } from '../bridge/envelope.js'
import { negotiateHistoireProtocol, validateHistoireHello } from '../bridge/handshake.js'
import { createDefaultHistoireSettings } from '../types/settings.js'

describe('frame handshake contracts', () => {
  it('negotiates highest common version and names incompatible ranges', () => {
    expect(negotiateHistoireProtocol({ min: 1, max: 2 }, { min: 1, max: 1 })).toBe(1)
    expect(() => negotiateHistoireProtocol({ min: 1, max: 2 }, { min: 3, max: 3 })).toThrow('Host protocol 1–2; book protocol 3–3')
  })

  it('validates exact origin and bootstrap ownership', () => {
    const hello = { kind: 'histoire:hello', protocolRange: { min: 1, max: 1 }, nonce: 'nonce', sessionId: 'session', mountId: 'mount', parentOrigin: 'http://localhost:3000', role: 'data' }
    expect(validateHistoireHello(hello)).toEqual(hello)
    for (const parentOrigin of ['null', '*', 'https://a.example/path', 'https://user:secret@a.example']) expect(() => validateHistoireHello({ ...hello, parentOrigin })).toThrow()
  })

  it('allows parent sync on primary port but denies child authority to sync parent', () => {
    const descriptor = createEmbedDescriptor()
    const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'connection', mountId: 'mount', sourceId: descriptor.sourceId, epoch: descriptor.epoch, revision: descriptor.revision }
    const payload = { status: 'ready', stale: false, source: null, catalog: descriptor.catalog, diagnostics: [], selection: null, runtime: { status: 'absent', mountId: null, runtimeId: null, layout: null, viewports: [], viewport: null }, state: null, settings: createDefaultHistoireSettings(), capabilities: descriptor.capabilities, events: { items: [], droppedCount: 0 } }
    const request = { ...owner, kind: 'request', requestId: 'sync', command: 'view.sync', payload }
    expect(() => validateBridgeEnvelope(request, owner, 'primary', undefined, 'parent-to-child')).not.toThrow()
    expect(() => validateBridgeEnvelope(request, owner, 'primary', undefined, 'child-to-parent')).toThrow('View sync is parent-to-view only')
  })
})
