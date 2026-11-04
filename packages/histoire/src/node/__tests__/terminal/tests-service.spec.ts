import { TerminalError } from '@histoire/cli/protocol/core'
import { parseTestResultsArgs, parseTestRunArgs } from '@histoire/cli/protocol/tests'
import { createHistoireTestSummary } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECTION_LIMITS, projectSummary } from '../../runtime/terminal/tests/projection.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createTestsHarness, storySummary } from './tests-harness.js'

// Boundary: real execution lane, real terminal-scoped owner, real service
// (admission, state machine, projection, retention, paging). Only the browser
// runner body is an observable fake; real browser counts live in the
// integration spec. Defects: cancelling another owner's job, releasing the lane
// before cleanup, overtaking queued work, publishing after source/generation
// change, unbounded results, silently lost batch targets.
describe('terminal test operations over the shared lane', () => {
  it('cancels only the terminal run; the other owner starts after confirmed cleanup', async () => {
    const h = createTestsHarness()
    const hold = h.behave('A', { gate: deferred(), cleanupGate: deferred() })
    const run = h.service.run({ scope: 'story', storyId: 'A' })
    await expect.poll(() => h.log).toContain('run:A')
    // Another owner (MCP/workbench) queues behind the held terminal run.
    const otherHandle = h.other.enqueue({ run: async () => {
      h.log.push('other:run')
      return storySummary('X')
    } })

    expect(h.service.cancel(run.operation.id)).toMatchObject({ state: 'cancelling', cancelRequested: true })
    await flushMicrotasks(30)
    // Cancellation is a request: the lane is still occupied until cleanup finishes.
    expect(h.log).not.toContain('other:run')
    expect(h.service.get(run.operation.id).state).toBe('cancelling')

    hold.cleanupGate!.resolve()
    expect((await run.settled).state).toBe('cancelled')
    await otherHandle.result
    expect(h.log.indexOf('cleanup:A')).toBeLessThan(h.log.indexOf('other:run'))
    expect(h.states(run.operation.id)).toEqual(['queued', 'running', 'cancelling', 'cancelled'])
  })

  it('does not cancel the other owner or let the terminal overtake existing work', async () => {
    const h = createTestsHarness()
    const gate = deferred()
    const otherHandle = h.other.enqueue({ run: async () => {
      h.log.push('other:start')
      await gate.promise
      h.log.push('other:end')
      return storySummary('X')
    } })
    await expect.poll(() => h.log).toContain('other:start')
    const run = h.service.run({ scope: 'story', storyId: 'B' })
    await flushMicrotasks(30)
    expect(h.service.get(run.operation.id).state).toBe('queued')

    // Terminal cleanup of its own queue does not touch the other owner's active job.
    await h.terminal.cancelAll()
    expect((await run.settled).state).toBe('cancelled')
    expect(otherHandle.state).toBe('running')
    gate.resolve()
    await otherHandle.result
    expect(h.log).not.toContain('run:B')
  })

  it('reports queue-full admission and records no operation', async () => {
    const h = createTestsHarness(['A', 'B'], { queuedTotal: 1 })
    h.behave('A', { gate: deferred() })
    const first = h.service.run({ scope: 'story', storyId: 'A' })
    await expect.poll(() => h.log).toContain('run:A')
    h.service.run({ scope: 'story', storyId: 'B' })
    expect(() => h.service.run({ scope: 'all' })).toThrowError(expect.objectContaining({ code: 'busy', message: 'Server execution queue is full' }))
    expect(h.service.activeCount).toBe(2)
    h.behaviors.get('A')!.gate!.resolve()
    await first.settled
  })

  it('refuses missing, ambiguous and non-executable targets before the lane sees them', () => {
    const h = createTestsHarness(['A', 'A', 'D'])
    for (const target of [{ scope: 'story', storyId: 'nope' }, { scope: 'story', storyId: 'A' }, { scope: 'variant', storyId: 'D', variantId: 'ghost' }] as const) {
      expect(() => h.service.run(target)).toThrowError(expect.objectContaining({ code: 'invalid' }))
    }
    expect(h.service.run({ scope: 'variant', storyId: 'D', variantId: 'main' }).operation.state).toBe('queued')
    expect(() => h.service.run({ scope: 'story', storyId: 'D' }, 'stale')).toThrowError(expect.objectContaining({ message: 'Catalog revision changed' }))
    expect(h.log).toEqual([])
  })

  it('fences publication by source and generation', async () => {
    const h = createTestsHarness()
    const hold = h.behave('A', { gate: deferred() })
    const run = h.service.run({ scope: 'story', storyId: 'A' })
    await expect.poll(() => h.log).toContain('run:A')
    const queued = h.service.run({ scope: 'story', storyId: 'B' })
    // Source edit while A's body is held and B waits: neither may be published as current.
    h.editSource()
    hold.gate!.resolve()
    expect(await run.settled).toMatchObject({ state: 'failed', failure: { code: 'RUNTIME_CHANGED' } })
    expect(await queued.settled).toMatchObject({ state: 'failed', failure: { code: 'RUNTIME_CHANGED' } })
    expect(h.log).not.toContain('run:B')

    // Released generation: late results and state events are suppressed.
    const released = h.service.run({ scope: 'story', storyId: 'C' })
    h.controller.abort()
    h.deactivate()
    const before = h.events.length
    await released.settled
    expect(h.events.length).toBe(before)
    expect(() => h.service.get(released.operation.id)).toThrowError(TerminalError)
  })

  it('keeps assertion failures as completed data and runner failures as failed operations', async () => {
    const h = createTestsHarness()
    h.behave('A', { failures: 1 })
    h.behave('B', { fail: new Error('browser crashed\nstack') })
    expect(await h.service.run({ scope: 'story', storyId: 'A' }).settled).toMatchObject({ state: 'completed', summary: { ok: false, total: 2, failed: 1, passed: 1 } })
    expect(await h.service.run({ scope: 'story', storyId: 'B' }).settled).toMatchObject({ state: 'failed', failure: { message: 'browser crashed' } })
  })
})

describe('affected-subset batch', () => {
  it('runs exactly the requested stories sequentially in one lane submission', async () => {
    const h = createTestsHarness()
    h.behave('A', { failures: 1 })
    const batch = h.service.runAffected(['B', 'A', 'B'])
    expect(batch.operation.target).toEqual({ scope: 'affected', count: 2, storyIds: ['B', 'A'] })
    // One submission on the lane regardless of story count.
    expect(h.terminal.pendingCount).toBe(1)
    const final = await batch.settled
    expect(final).toMatchObject({ state: 'completed', summary: { total: 4, failed: 1, passed: 3 } })
    expect(h.log).toEqual(['run:B', 'done:B', 'cleanup:B', 'run:A', 'done:A', 'cleanup:A'])
    expect(batch.pending()).toEqual([])
    // Failures page first, then the remaining cases in execution order.
    expect(h.service.results({ operationId: final.id }).cases.map(test => `${test.storyId}:${test.state}`)).toEqual(['A:failed', 'B:passed', 'B:passed', 'A:passed'])
  })

  it('stops between stories on cancel, cleans up, and keeps unfinished targets pending', async () => {
    const h = createTestsHarness()
    const hold = h.behave('A', { gate: deferred() })
    const batch = h.service.runAffected(['A', 'B', 'C'])
    await expect.poll(() => h.log).toContain('run:A')
    h.service.cancel(batch.operation.id)
    expect((await batch.settled).state).toBe('cancelled')
    hold.gate!.resolve()
    expect(h.log).not.toContain('run:B')
    // Every captured task is cleaned up exactly once, including ones that never ran.
    expect(h.log.filter(entry => entry.startsWith('cleanup:')).sort()).toEqual(['cleanup:A', 'cleanup:B', 'cleanup:C'])
    expect(batch.pending()).toEqual(['A', 'B', 'C'])
  })

  it('stops on infrastructure failure after finishing earlier stories', async () => {
    const h = createTestsHarness()
    h.behave('B', { fail: new Error('worker exited') })
    const batch = h.service.runAffected(['A', 'B', 'C'])
    expect(await batch.settled).toMatchObject({ state: 'failed', failure: { message: 'worker exited' } })
    expect(h.log).not.toContain('run:C')
    expect(batch.pending()).toEqual(['B', 'C'])
    expect(h.log).toContain('cleanup:B')
  })

  it('refuses unknown stories and empty batches', () => {
    const h = createTestsHarness()
    expect(() => h.service.runAffected(['A', 'ghost'])).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(() => h.service.runAffected([])).toThrowError(expect.objectContaining({ code: 'invalid' }))
    expect(h.log).toEqual([])
  })
})

describe('result retention and paging', () => {
  it('keeps exact totals while bounding cases, failures first, with explicit omissions', async () => {
    const h = createTestsHarness()
    h.behave('A', { cases: 250, failures: 3 })
    const projection = { caseBytes: 16 * 1024, errorChars: 4096, errorsPerCase: 5, retainBytes: 20_000, runErrors: 20, uncollected: 50 }
    const service = h.make({ projection })
    const final = await service.run({ scope: 'story', storyId: 'A' }).settled
    expect(final.summary).toMatchObject({ total: 250, failed: 3, passed: 247 })
    expect(final.summary!.omittedCases).toBeGreaterThan(0)
    expect(final.summary!.retainedCases + final.summary!.omittedCases).toBe(250)
    const failed = service.results({ operationId: final.id, failedOnly: true })
    expect(failed.cases.map(test => test.state)).toEqual(['failed', 'failed', 'failed'])
    expect(failed.total).toBe(3)

    const big = await h.service.run({ scope: 'story', storyId: 'A' }).settled
    const pages = []
    let cursor: string | undefined
    do {
      const page = h.service.results({ operationId: big.id, cursor })
      expect(page.cases.length).toBeLessThanOrEqual(100)
      pages.push(page)
      cursor = page.next
    } while (cursor)
    expect(pages.map(page => page.cases.length)).toEqual([100, 100, 50])
    expect(() => h.service.results({ operationId: big.id, cursor: 'x1' })).toThrowError(expect.objectContaining({ code: 'invalid' }))
  })

  it('evicts oldest finished runs and reports evicted reads as unavailable', async () => {
    const h = createTestsHarness()
    const service = h.make({ store: { runs: 2, bytes: 1e9 } })
    const ids: string[] = []
    for (let index = 0; index < 3; index++) ids.push((await service.run({ scope: 'story', storyId: 'A' }).settled).id)
    expect(service.results({ operationId: ids[0] })).toMatchObject({ unavailable: 'evicted', cases: [] })
    expect(service.results({ operationId: ids[2] }).cases).toHaveLength(2)
    expect(service.results({ operationId: 'never-seen' })).toMatchObject({ unavailable: 'unknown' })
    expect(() => service.get(ids[0])).toThrowError(/evicted/)
    // Evicted data is never re-run implicitly.
    expect(h.log.filter(entry => entry.startsWith('run:'))).toHaveLength(3)
  })

  it('drops the error text of an oversized case but keeps its identity and state', () => {
    const summary = createHistoireTestSummary('A', 'main', [{ name: 'huge', state: 'failed', errors: ['x'.repeat(4096), 'y'.repeat(4096), 'z'.repeat(4096)] }])
    const projected = projectSummary(summary, { ...DEFAULT_PROJECTION_LIMITS, errorChars: 4096, caseBytes: 2000 })
    expect(projected.cases[0]).toMatchObject({ name: 'huge', state: 'failed', errors: [], unavailable: true })
    expect(projected.summary).toMatchObject({ total: 1, failed: 1, retainedCases: 1 })
  })
})

describe('private argument validation', () => {
  it('accepts exact targets and rejects widened or malformed ones', () => {
    expect(parseTestRunArgs({ target: { scope: 'variant', storyId: 'a', variantId: 'b' } }).target).toEqual({ scope: 'variant', storyId: 'a', variantId: 'b' })
    for (const bad of [null, {}, { target: { scope: 'all', storyId: 'a' } }, { target: { scope: 'story' } }, { target: { scope: 'affected' } }, { target: { scope: 'all' }, extra: 1 }, { target: { scope: 'story', storyId: '' } }]) {
      expect(() => parseTestRunArgs(bad)).toThrowError(TerminalError)
    }
    expect(() => parseTestResultsArgs({ operationId: 'x', limit: 101 })).toThrowError(TerminalError)
    expect(parseTestResultsArgs({ operationId: 'x', limit: 100, failedOnly: true })).toMatchObject({ limit: 100 })
  })
})
