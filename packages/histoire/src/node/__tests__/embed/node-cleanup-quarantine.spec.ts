import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getProjectServices } from '../../api/internal.js'
import { createHistoireProject } from '../../api/project.js'
import { hasUnconfirmedCleanup, RuntimeCleanupError } from '../../runtime/cleanup.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

const runner = vi.hoisted(() => vi.fn(async () => ({ ok: true, total: 0 })))
const build = vi.hoisted(() => vi.fn())
vi.mock('../../test/index.js', () => ({ runHistoireTests: runner }))
vi.mock('../../api/build.js', () => ({ buildProject: build }))

describe('node project cleanup quarantine', () => {
  it('quarantines actual idle test context cleanup before queued or future work starts', async () => {
    const fixture = await createMcpProjectFixture()
    await writeFile(join(fixture.root, 'package.json'), '{"type":"module"}')
    await writeFile(join(fixture.root, 'histoire.config.mjs'), `export default {
      mcp: false,
      plugins: [{ name: 'cleanup-failure', configResolved(config, context) {
        context.onCleanup(() => { throw new Error('plugin disposer failed') })
      } }],
    }`)
    const project = await createHistoireProject({ root: fixture.root, configFile: 'histoire.config.mjs' })
    const execution = getProjectServices(project).execution
    const replacement = vi.fn(() => 'must not start')
    try {
      const tests = project.runTests()
      const queued = execution.enqueue({ run: replacement })
      await expect(tests).rejects.toMatchObject({ code: 'HISTOIRE_RUNTIME_CLEANUP_FAILED' })
      expect(runner).toHaveBeenCalledOnce()
      await expect(queued.result).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(replacement).not.toHaveBeenCalled()
      expect(execution.available).toBe(false)
      await expect(project.runTests()).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
      // The original API promise has settled and left the in-flight set.
      await expect(project.close()).rejects.toMatchObject({ code: 'HISTOIRE_RUNTIME_CLEANUP_FAILED' })
      await expect(project.close()).rejects.toMatchObject({ code: 'HISTOIRE_RUNTIME_CLEANUP_FAILED' })
    }
    finally {
      await project.close().catch(() => {})
      await fixture.close()
    }
  })

  it('retains settled independent-operation cleanup failures for project close', async () => {
    const fixture = await createMcpProjectFixture()
    const project = await createHistoireProject({ root: fixture.root })
    const failure = new RuntimeCleanupError([], 'build teardown unknown')
    build.mockRejectedValueOnce(failure)
    try {
      await expect(project.build()).rejects.toBe(failure)
      await flushMicrotasks()
      const execution = getProjectServices(project).execution
      expect(execution.available).toBe(false)
      expect(() => execution.enqueue({ run: () => 'must not start' })).toThrow('unavailable')
      await expect(project.close()).rejects.toBe(failure)
    }
    finally {
      await project.close().catch(() => {})
      await fixture.close()
    }
  })

  it('keeps aggregate cleanup failure in scoped owners after handle settlement', async () => {
    const execution = createExecutionService()
    const owner = createExecutionOwner(execution)
    const failure = new AggregateError([new RuntimeCleanupError([], 'plugin teardown unknown')], 'startup failed')
    const handle = owner.enqueue({ run: () => {
      throw failure
    } })
    await expect(handle.result).rejects.toBe(failure)
    await flushMicrotasks()
    expect(execution.available).toBe(false)
    await expect(owner.close()).rejects.toSatisfy(hasUnconfirmedCleanup)
    await expect(owner.close()).rejects.toSatisfy(hasUnconfirmedCleanup)
    await expect(execution.close()).rejects.toSatisfy(hasUnconfirmedCleanup)
  })

  it('retains scoped drain timeout after late runner settlement', async () => {
    const execution = createExecutionService()
    const owner = createExecutionOwner(execution, 5)
    const late = deferred<void>()
    const handle = owner.enqueue({ run: () => late.promise })
    await flushMicrotasks()
    try {
      await expect(owner.cancelAll()).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
      late.resolve()
      await expect(handle.result).rejects.toMatchObject({ code: 'CANCELLED' })
      await flushMicrotasks()
      await expect(owner.close()).rejects.toSatisfy(hasUnconfirmedCleanup)
    }
    finally {
      late.resolve()
      await execution.close().catch(() => {})
    }
  })
})
