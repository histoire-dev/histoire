import { describe, expect, it, vi } from 'vitest'
import { createMcpOperations } from '../../mcp/operations/store.js'
import { MCP_LIMITS } from '../../mcp/protocol/limits.js'
import { OPERATION_EPOCH, operationFixture, testOperationInput, testOperationOutput } from '../utils/mcp/operations.js'

describe('bounded retained operation results', () => {
  it('retains deduplication tombstones after result eviction and expires exact retry window', async () => {
    const { operations } = operationFixture()
    const started = vi.fn(() => testOperationOutput())
    operations.registerExecutor('tests', () => ({ run: started }))
    const first = operations.admit('alice', 'tests', testOperationInput('first'))
    await vi.waitFor(() => expect(operations.get('alice', first.operationId).state).toBe('completed'))
    for (let index = 0; index < MCP_LIMITS.terminalOperations; index++) {
      const job = operations.admit('alice', 'tests', testOperationInput(`later-${index}`))
      await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    }
    expect(() => operations.admit('alice', 'tests', testOperationInput('first'))).toThrow('result was evicted')
    expect(started).toHaveBeenCalledTimes(MCP_LIMITS.terminalOperations + 1)
    await operations.close()
  })

  it('uses terminal time for retention and reserves bounded retry identities', async () => {
    let now = 1000
    const operations = createMcpOperations({ now: () => now, capture: () => ({ projectId: 'project_test', epoch: OPERATION_EPOCH, revision: `${OPERATION_EPOCH}:1`, value: null, isActive: () => true, validate: () => {} }) })
    operations.registerExecutor('tests', () => ({ run: () => testOperationOutput() }))
    for (let index = 0; index < MCP_LIMITS.requestKeys; index++) {
      const job = operations.admit('alice', 'tests', testOperationInput(`retained-${index}`))
      await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    }
    expect(() => operations.admit('alice', 'tests', testOperationInput('overflow'))).toThrow('retry retention is full')
    now += MCP_LIMITS.retentionMs
    const restarted = operations.admit('alice', 'tests', testOperationInput('retained-0'))
    expect(restarted.state).toBe('queued')
    await operations.close()
  })

  it('pages all test failures and retains aggregate counts without dropping details', async () => {
    const { operations } = operationFixture()
    const output = testOperationOutput()
    if (!('summary' in output.result)) throw new Error('Test fixture is invalid')
    const summary = output.result.summary
    summary.tests = Array.from({ length: 150 }, (_, index) => ({ id: `${index}`, name: `failure-${index}`, fullName: `failure-${index}`, state: 'failed', errors: ['failure'], storyId: 'story', variantId: 'variant' }))
    summary.ok = false
    summary.total = summary.failed = 150
    summary.passed = 0
    operations.registerExecutor('tests', () => ({ run: () => output }))
    const job = operations.admit('alice', 'tests', testOperationInput('full-result'))
    await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    const dto = operations.get('alice', job.operationId)
    expect('summary' in dto.result! && dto.result.summary.failed).toBe(150)
    expect('truncated' in dto.result! && dto.result.truncated).toBe(true)
    const resource = operations.readResource({ projectId: 'project_test', kind: 'operation', operationId: job.operationId, offset: 100, limit: 100 }, 'histoire://project_test/operations/result', 'alice')
    const page = JSON.parse(resource.contents[0].text!)
    expect(page.result.summary.tests).toHaveLength(50)
    expect(page.result.summary.tests[49].id).toBe('149')
    await operations.close()
  })

  it('drops released generation results and rejects all reads after close', async () => {
    const { operations } = operationFixture()
    operations.registerExecutor('tests', () => ({ run: () => testOperationOutput() }))
    const job = operations.admit('alice', 'tests', testOperationInput('released'))
    await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    await operations.invalidate(OPERATION_EPOCH)
    expect(() => operations.get('alice', job.operationId)).toThrow('Operation is unavailable or expired')
    await operations.close()
    expect(() => operations.readResource({ projectId: 'project_test', kind: 'operation', operationId: job.operationId }, 'histoire://project_test/operations/closed', 'alice')).toThrow('Resource is unavailable or expired')
    expect(() => operations.admit('alice', 'tests', testOperationInput('closed'))).toThrow('Operation service is closed')
  })
})
