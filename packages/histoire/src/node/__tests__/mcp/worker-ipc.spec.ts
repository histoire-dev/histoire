import { describe, expect, it } from 'vitest'
import { MCP_LIMITS } from '../../mcp/protocol/limits.js'
import { assertWorkerFrame, parseWorkerInput, WORKER_BINARY_BYTES, WORKER_METADATA_BYTES, workerChildMessageSchema, workerParentMessageSchema } from '../../mcp/transport/worker-protocol.js'

describe('owned MCP worker protocol', () => {
  it('rejects arbitrary dispatch, unknown fields and invalid request capabilities', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000:1'
    expect(workerParentMessageSchema.parse({ type: 'request', id, method: 'getProject', input: {} }).method).toBe('getProject')
    expect(() => workerParentMessageSchema.parse({ type: 'request', id, method: 'import', input: {} })).toThrow()
    expect(() => workerParentMessageSchema.parse({ type: 'request', id: 1, method: 'getProject', input: {} })).toThrow()
    expect(() => workerParentMessageSchema.parse({ type: 'shutdown', module: 'node:fs' })).toThrow()
    expect(() => workerChildMessageSchema.parse({ type: 'error', id, error: { code: 'INTERNAL_ERROR', message: 'Failed', retryable: false, stack: 'private' } })).toThrow()
  })

  it('uses existing strict tool schemas, preserving exact IDs and defaults', () => {
    expect(parseWorkerInput('getDocs', { storyId: '../汉字%2E' })).toEqual({ storyId: '../汉字%2E', offset: 0, limit: MCP_LIMITS.docsCharacters })
    expect(() => parseWorkerInput('getSource', { storyId: 'x', path: '/secret' })).toThrow()
    expect(() => parseWorkerInput('readResource', { uri: 'histoire://book/project', principal: 'other' })).toThrow()
  })

  it('applies separate bounded metadata and binary budgets', () => {
    expect(() => assertWorkerFrame({ text: 'x'.repeat(WORKER_METADATA_BYTES) })).toThrow('Histoire MCP worker message exceeds byte limit')
    expect(() => assertWorkerFrame({ text: 'x'.repeat(WORKER_METADATA_BYTES) }, true)).not.toThrow()
    expect(() => assertWorkerFrame({ text: 'x'.repeat(WORKER_BINARY_BYTES) }, true)).toThrow()
  })
})
