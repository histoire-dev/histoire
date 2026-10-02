import { COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT } from '@histoire/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPreviewTestHost } from '../../mcp/browser/preview-test-script.js'

/** Execute actual fixed host dispatcher, with a controlled same-origin frame. */
function host() {
  let listener: (event: any) => void
  vi.stubGlobal('window', { addEventListener: (_name, callback) => {
    listener = callback
  } })
  let documentId = 'document-1'
  const frame = { contentWindow: { postMessage: vi.fn() } }
  const state = { active: true, ready: true, storyId: 'a:b', variantId: 'c', epoch: 'epoch', nonce: 'nonce', documentId, currentDocumentId: () => documentId }
  const api = installPreviewTestHost(frame as any, state, { origin: 'http://localhost:6006', types: [COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT], resultBytes: 4096 })
  const command = { kind: 'run' as const, id: 'run-id', documentId, nonce: state.nonce, epoch: state.epoch, storyId: state.storyId, variantId: state.variantId }
  return { frame, state, api, command, navigate: () => {
    documentId = 'document-2'
  }, reply: (data = {}, overrides = {}) => listener!({ source: frame.contentWindow, origin: 'http://localhost:6006', data: { __histoire: true, type: TEST_RESULT, runId: command.id, documentId: command.documentId, mcpNonce: command.nonce, mcpEpoch: command.epoch, storyId: command.storyId, variantId: command.variantId, summary: { total: 1 }, ...data }, ...overrides }) }
}

afterEach(() => vi.unstubAllGlobals())

describe('compiled preview test protocol', () => {
  it('dispatches fixed commands once and consumes one matching response', () => {
    const value = host()
    expect(value.api.request(value.command)).toBe(true)
    expect(value.api.request(value.command)).toBe(false)
    expect(value.frame.contentWindow.postMessage).toHaveBeenCalledOnce()
    value.reply()
    expect(value.api.settled(value.command)).toBe(true)
    expect(value.api.take(value.command)).toEqual({ summary: { total: 1 } })
    expect(value.api.take(value.command)).toBeUndefined()
    expect(value.api.request(value.command)).toBe(false)
  })

  it.each([
    ['source', {}, { source: {} }],
    ['origin', {}, { origin: 'http://foreign.invalid' }],
    ['marker', { __histoire: false }],
    ['nonce', { mcpNonce: 'other' }],
    ['epoch', { mcpEpoch: 'other' }],
    ['document', { documentId: 'document-2' }],
    ['run ID', { runId: 'other' }],
    ['operation kind', { type: TEST_DEFINITIONS, requestId: 'run-id' }],
    ['delimiter collision', { storyId: 'a', variantId: 'b:c', variantKey: 'a:b:c' }],
  ])('drops wrong %s authority', (_name, data, overrides = {}) => {
    const value = host()
    value.api.request(value.command)
    value.reply(data as any, overrides)
    expect(value.api.settled(value.command)).toBe(false)
    value.reply()
    expect(value.api.take(value.command)).toEqual({ summary: { total: 1 } })
  })

  it('discards delayed result after same WindowProxy navigation', () => {
    const value = host()
    value.api.request(value.command)
    value.navigate()
    value.reply()
    expect(value.api.settled(value.command)).toBe(true)
    expect(value.api.take(value.command)).toBeUndefined()
    expect(value.api.request({ ...value.command, id: 'new-run' })).toBe(false)
  })

  it('bounds completed response before Playwright copies it to Node', () => {
    const value = host()
    value.api.request(value.command)
    value.reply({ summary: { errors: ['x'.repeat(5000)] } })
    expect(value.api.take(value.command)).toEqual({ oversized: true })
  })
})
