import { describe, expect, it } from 'vitest'
import { createDevMcpActivity } from '../../mcp/observer/activity.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { operationFixture, testOperationInput, testOperationOutput } from '../utils/mcp/operations.js'

describe('mCP UI operation observers', () => {
  it('publishes ordered safe lifecycle projections and independent snapshots', async () => {
    const { operations } = operationFixture()
    const gate = deferred<ReturnType<typeof testOperationOutput>>()
    operations.registerExecutor('tests', () => ({ run: () => gate.promise }))
    const events: any[] = []
    const off = operations.onOperationChange(operation => events.push(operation))
    const admitted = operations.admit('secret-principal', 'tests', testOperationInput('private-request-key'))
    expect(events.map(event => event.state)).toEqual(['queued'])
    await flushMicrotasks()
    expect(events.map(event => event.state)).toEqual(['queued', 'running'])
    gate.resolve(testOperationOutput())
    await flushMicrotasks()
    expect(events.map(event => event.state)).toEqual(['queued', 'running', 'done'])
    expect(events.map(event => event.cancellable)).toEqual([true, true, false])
    expect(events[2]).toMatchObject({ id: admitted.operationId, tool: 'histoire_run_tests', target: { storyId: 'story', variantId: 'variant' }, progress: { done: 1, total: 1 } })
    expect(events[2].endedAt).toBeDefined()
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('secret-principal')
    expect(serialized).not.toContain('private-request-key')
    expect(serialized).not.toContain('summary')
    events[2].target.storyId = 'mutated'
    expect(operations.snapshot()[0].target?.storyId).toBe('story')
    off()
    await operations.close()
  })

  it('cancels exact operation through its owner and waits for active cleanup', async () => {
    const { operations } = operationFixture()
    const run = deferred<ReturnType<typeof testOperationOutput>>()
    const cleanup = deferred<void>()
    operations.registerExecutor('tests', () => ({ run: () => run.promise, cleanup: () => cleanup.promise }))
    const first = operations.admit('first-owner', 'tests', testOperationInput('first'))
    await flushMicrotasks()
    const second = operations.admit('second-owner', 'tests', testOperationInput('second'))
    operations.cancelFromUi(first.operationId)
    expect(operations.get('first-owner', first.operationId).state).toBe('cancelling')
    expect(operations.get('second-owner', second.operationId).state).toBe('queued')
    expect(operations.snapshot().find(operation => operation.id === first.operationId)?.state).toBe('running')
    run.resolve(testOperationOutput())
    cleanup.resolve()
    await flushMicrotasks()
    expect(operations.snapshot().find(operation => operation.id === first.operationId)?.state).toBe('cancelled')
    expect(() => operations.cancelFromUi('missing')).toThrow('Operation is unavailable or expired')
    await operations.close()
  })

  it('keeps last 50 operations, isolates throwing listeners, and removes invalidated history', async () => {
    const { operations } = operationFixture()
    operations.registerExecutor('tests', () => ({ run: () => testOperationOutput() }))
    const off = operations.onOperationChange(() => {
      throw new Error('observer failed')
    })
    for (let index = 0; index < 55; index++) {
      operations.admit('owner', 'tests', testOperationInput(String(index)))
      await flushMicrotasks()
    }
    expect(operations.snapshot()).toHaveLength(50)
    off()
    await operations.invalidate()
    expect(operations.snapshot()).toEqual([])
    await operations.close()
  })

  it('records failed starter calls without results and observes exact handle polling', async () => {
    const { operations } = operationFixture()
    const activity = createDevMcpActivity()
    const service = activity.observeOperations(operations)
    const off = operations.onOperationChange(activity.publish)
    try {
      await expect(activity.observeExchange(async () => {
        service.admit('private-owner', 'tests', testOperationInput('private-key'))
      })).rejects.toThrow('Operation executor is unavailable')
      expect(activity.snapshot().operations).toMatchObject([{ tool: 'histoire_run_tests', state: 'failed', target: { storyId: 'story', variantId: 'variant' } }])
      operations.registerExecutor('tests', () => ({ run: () => testOperationOutput() }))
      let id: string
      await activity.observeExchange(async () => {
        id = service.admit('private-owner', 'tests', testOperationInput('second-key')).operationId
      })
      await flushMicrotasks()
      await activity.observeExchange(async () => {
        service.get('private-owner', id)
      })
      const snapshot = activity.snapshot()
      expect(snapshot.operations.map(operation => operation.tool)).toEqual(['histoire_run_tests', 'histoire_run_tests', 'histoire_get_operation'])
      expect(JSON.stringify(snapshot)).not.toContain('private-owner')
      expect(JSON.stringify(snapshot)).not.toContain('private-key')
      expect(JSON.stringify(snapshot)).not.toContain('summary')
    }
    finally {
      off()
      await operations.close()
    }
  })

  it('rejects active metadata overflow before allocating another executor', async () => {
    const { operations } = operationFixture()
    const run = deferred<ReturnType<typeof testOperationOutput>>()
    let allocations = 0
    operations.registerExecutor('tests', () => {
      allocations++
      return { run: () => run.promise }
    })
    const identity = '\u0001'.repeat(2_048)
    try {
      operations.admit('owner', 'tests', testOperationInput('first', identity, identity))
      expect(() => operations.admit('owner', 'tests', testOperationInput('second', identity, identity))).toThrow('MCP activity capacity reached')
      expect(allocations).toBe(1)
      expect(operations.snapshot()[0].target).toEqual({ storyId: identity, variantId: identity })
    }
    finally {
      run.resolve(testOperationOutput(identity, identity))
      await operations.close()
    }
  })
})
