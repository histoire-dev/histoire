import { describe, expect, it, vi } from 'vitest'
import { createMcpOperations } from '../../mcp/operations/store.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { NEXT_OPERATION_EPOCH, operationFixture, testOperationInput, testOperationOutput } from '../utils/mcp/operations.js'

describe('owned operation admission', () => {
  it('publishes different variant results in FIFO order without reusing another request summary', async () => {
    const { operations } = operationFixture()
    const firstResult = deferred<ReturnType<typeof testOperationOutput>>()
    const calls: string[] = []
    operations.registerExecutor('tests', input => ({ run: () => {
      calls.push(input.variantId!)
      return input.variantId === 'first' ? firstResult.promise : testOperationOutput('story', input.variantId)
    } }))
    const first = operations.admit('alice', 'tests', testOperationInput('first', 'story', 'first'))
    const second = operations.admit('alice', 'tests', testOperationInput('second', 'story', 'second'))
    await flushMicrotasks()
    expect(calls).toEqual(['first'])
    firstResult.resolve(testOperationOutput('story', 'first'))
    await vi.waitFor(() => expect(operations.get('alice', second.operationId).state).toBe('completed'))
    expect(operations.get('alice', first.operationId).result?.variantId).toBe('first')
    expect(operations.get('alice', second.operationId).result?.variantId).toBe('second')
    expect(calls).toEqual(['first', 'second'])
    await operations.close()
  })
  it('reconciles lost admission responses before execution and rejects parameter conflicts', async () => {
    const { operations } = operationFixture()
    const result = deferred<ReturnType<typeof testOperationOutput>>()
    const executed = vi.fn(() => result.promise)
    operations.registerExecutor('tests', () => ({ run: executed }))
    const input = testOperationInput('retry-key')
    const first = operations.admit('alice', 'tests', input)
    const repeated = operations.admit('alice', 'tests', { ...input })
    expect(repeated.operationId).toBe(first.operationId)
    expect(() => operations.admit('alice', 'tests', { ...input, variantId: 'different' })).toThrow('different operation parameters')
    const other = operations.admit('bob', 'tests', input)
    expect(other.operationId).not.toBe(first.operationId)
    await flushMicrotasks()
    expect(executed).toHaveBeenCalledTimes(1)
    result.resolve(testOperationOutput())
    await vi.waitFor(() => expect(operations.get('alice', first.operationId).state).toBe('completed'))
    await operations.close()
  })

  it('rejects foreign/random/stale handles without revealing job existence', async () => {
    const { operations, current } = operationFixture()
    operations.registerExecutor('tests', () => ({ run: () => testOperationOutput() }))
    const job = operations.admit('alice', 'tests', testOperationInput('one'))
    for (const read of [() => operations.get('bob', job.operationId), () => operations.cancel('bob', job.operationId), () => operations.get('alice', NEXT_OPERATION_EPOCH)]) {
      expect(read).toThrow('Operation is unavailable or expired')
    }
    await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    current.epoch = NEXT_OPERATION_EPOCH
    current.revision = `${NEXT_OPERATION_EPOCH}:1`
    expect(() => operations.get('alice', job.operationId)).toThrow('Operation is unavailable or expired')
    await operations.close()
  })

  it('revalidates revisions when dequeued and before publishing late results', async () => {
    const { operations, current } = operationFixture()
    const result = deferred<ReturnType<typeof testOperationOutput>>()
    const calls: string[] = []
    operations.registerExecutor('tests', input => ({ run: () => {
      calls.push(input.variantId!)
      return result.promise
    } }))
    const active = operations.admit('alice', 'tests', testOperationInput('active', 'story', 'first'))
    const queued = operations.admit('alice', 'tests', testOperationInput('queued', 'story', 'second'))
    await flushMicrotasks()
    current.revision = `${current.epoch}:2`
    result.resolve(testOperationOutput('story', 'first'))
    await vi.waitFor(() => expect(operations.get('alice', queued.operationId).state).toBe('failed'))
    expect(operations.get('alice', active.operationId).error?.code).toBe('STALE_REVISION')
    expect(operations.get('alice', queued.operationId).error?.code).toBe('STALE_REVISION')
    expect(calls).toEqual(['first'])
    await operations.close()
  })

  it('does not admit unsupported operations', async () => {
    const { operations } = operationFixture()
    expect(operations.hasExecutor('tests')).toBe(false)
    expect(() => operations.admit('alice', 'tests', testOperationInput('missing'))).toThrow('executor is unavailable')
    await operations.close()
  })

  it('does not accept reads when current project authority cannot be captured', async () => {
    const operations = createMcpOperations({ capture: () => {
      throw new Error('secret raw lifecycle error')
    } })
    expect(() => operations.get('alice', NEXT_OPERATION_EPOCH)).toThrow('Operation is unavailable or expired')
    await operations.close()
  })
})
