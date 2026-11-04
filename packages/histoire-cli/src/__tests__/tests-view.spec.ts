import type { TestCaseDto, TestOperationDto, TestResultsArgs, TestSummaryDto } from '../terminal/protocol/tests.js'
import { describe, expect, it, vi } from 'vitest'
import { getTestTargetHandoff } from '../terminal/stories/handoff.js'
import { createTestsView } from '../terminal/views/tests.js'
import { operation } from './tests-console-rig.js'
import { readyGeneration } from './utils/terminal/progress.js'
import { createScriptedBridge, createViewHostRig } from './utils/terminal/view-host.js'

const summary = (extra: Partial<TestSummaryDto> = {}): TestSummaryDto => ({ ok: false, total: 150, passed: 100, failed: 3, skipped: 47, retainedCases: 150, omittedCases: 0, runErrors: [], omittedRunErrors: 0, uncollected: [], omittedUncollected: 0, ...extra })

/** 3 failures first (the child's order), then passing cases. */
const cases: TestCaseDto[] = Array.from({ length: 150 }, (_, index) => index < 3
  ? { id: `f${index}`, name: `fails ${index}`, fullName: `fails ${index}`, state: 'failed', storyId: 'book', variantId: 'v', errors: [`AssertionError: expected ${index}`] }
  : { id: `p${index}`, name: `passes ${index}`, fullName: `passes ${index}`, state: 'passed', storyId: 'book', variantId: 'v', errors: [] })

/** Tests view over the real console, state and result list; the child's three operations are scripted. */
function openTests() {
  const sent: { operation: string, args: unknown }[] = []
  const bridge = createScriptedBridge((operation_, args) => {
    sent.push({ operation: operation_, args })
    if (operation_ === 'tests.run') return operation('run1', 'queued')
    if (operation_ === 'tests.cancel') return operation('run1', 'cancelling', { cancelRequested: true })
    const { failedOnly, cursor } = args as TestResultsArgs
    const matching = failedOnly ? cases.slice(0, 3) : cases
    const start = cursor ? Number(cursor) : 0
    const end = Math.min(matching.length, start + 100)
    return { operationId: 'run1', cases: matching.slice(start, end), total: matching.length, next: end < matching.length ? String(end) : undefined }
  })
  const rig = createViewHostRig({ bridge, rows: 24, columns: 100 })
  readyGeneration(rig.progress, 'g1')
  const screen = rig.open(createTestsView)
  const tests = rig.host.tests
  const emit = (data: TestOperationDto, generation = 'g1') => tests.state.onEvent(generation, 'tests.state', data)
  return { ...screen, rig, tests, sent, emit, text: () => screen.screen().join('\n') }
}

// Boundary: real view, console, cache and result list; the child operations are scripted.
// Defects: counts taken from loaded pages instead of the summary, failures hidden by
// paging or filters, a restarted runtime's result shown as current, a duplicate `r`
// submitting twice, Enter running tests instead of opening the selected case.
describe('tests view', () => {
  it('runs the selected scope once, then shows progress, exact totals, uncollected stories and run errors', async () => {
    const view = openTests()
    expect(view.text()).toContain('All stories')
    expect(view.text()).toContain('Press r to run the selected scope')
    view.keys('r', 'r')
    await vi.waitFor(() => expect(view.text()).toContain('Queued'))
    expect(view.sent.filter(call => call.operation === 'tests.run')).toEqual([{ operation: 'tests.run', args: { target: { scope: 'all' } } }])

    view.emit(operation('run1', 'running'))
    view.tests.state.onEvent('g1', 'tests.progress', { operationId: 'run1', progress: { phase: 'collect', completed: 3, total: 10 } })
    expect(view.text()).toContain('Collecting 3/10')
    view.tests.state.onEvent('g1', 'tests.progress', { operationId: 'run1', progress: { phase: 'run', completed: 12, total: 40 } })
    expect(view.text()).toContain('Running 12/40')

    view.emit(operation('run1', 'completed', { summary: summary({ uncollected: [{ relativePath: 'Broken.story.vue', error: 'ReferenceError: boom' }], runErrors: ['Run level problem'], omittedCases: 5 }) }))
    await vi.waitFor(() => expect(view.text()).toContain('100 of 150 cases'))
    const text = view.text()
    expect(text).toContain('150 tests · 100 passed · 3 failed · 47 skipped')
    expect(text).toContain('Uncollected Broken.story.vue · ReferenceError: boom')
    expect(text).toContain('Error Run level problem')
    expect(text).toContain('5 cases omitted, counted in totals')
    // Failures lead the list.
    expect(view.screen().find(line => line.includes('FAIL'))).toContain('fails 0')
  })

  it('filters failures, pages further cases on demand and opens a failure in detail', async () => {
    const view = openTests()
    view.keys('r')
    await vi.waitFor(() => expect(view.tests.busy()).toBe(true))
    view.emit(operation('run1', 'completed', { summary: summary() }))
    await vi.waitFor(() => expect(view.text()).toContain('100 of 150 cases, more to load'))
    // Moving to the end of the loaded rows requests the next page by its cursor.
    view.keys('end')
    await vi.waitFor(() => expect(view.sent.some(call => (call.args as TestResultsArgs).cursor === '100')).toBe(true))
    await vi.waitFor(() => expect(view.text()).toContain('150 of 150 cases'))

    view.keys('f')
    await vi.waitFor(() => expect(view.text()).toContain('3 of 3 failed cases'))
    view.keys('return')
    expect(view.text()).toMatch(/AssertionError: expected \d/)
    expect(view.sent.filter(call => call.operation === 'tests.run')).toHaveLength(1)
    // Detail owns the keys: `s` must not cancel anything.
    view.keys('s')
    expect(view.sent.some(call => call.operation === 'tests.cancel')).toBe(false)
  })

  it('keeps an old run historical beside the new one after a restart', async () => {
    const view = openTests()
    view.keys('r')
    await vi.waitFor(() => expect(view.tests.busy()).toBe(true))
    view.emit(operation('run1', 'completed', { summary: summary({ ok: true, failed: 0, passed: 150, skipped: 0 }) }))
    await vi.waitFor(() => expect(view.text()).toContain('Passed · 150 tests'))
    expect(view.text()).not.toContain('Historical')

    view.rig.progress.onStatus({ status: 'restarting' })
    view.rig.progress.onRuntimeStart({ generation: 'g2', fresh: false })
    expect(view.text()).toContain('Historical')
    expect(view.text()).toContain('runtime restarted since this run')
    expect(view.rig.panelSegments()).toEqual([])
  })

  it('stops with s and says cancellation is waiting for cleanup', async () => {
    const view = openTests()
    view.keys('r')
    await vi.waitFor(() => expect(view.tests.busy()).toBe(true))
    view.keys('s')
    await vi.waitFor(() => expect(view.text()).toContain('Cancelling, waiting for cleanup'))
    expect(view.rig.notices.at(-1)).toBe('Cancelling tests, waiting for cleanup')
    view.emit(operation('run1', 'cancelled'))
    expect(view.text()).toContain('Cancelled after cleanup')
  })

  it('selects the story handed over by the story browser and disables it once its generation is gone', () => {
    const view = openTests()
    getTestTargetHandoff(view.rig.host).set({ target: { scope: 'variant', storyId: 'b', variantId: 'two' }, label: 'B / two', storyLabel: 'B', revision: 'r', generation: 'g1' })
    expect(view.text()).toContain('Variant: B / two')
    view.keys('left')
    expect(view.text()).toContain('Story: B')
    view.rig.progress.onStatus({ status: 'restarting' })
    view.rig.progress.onRuntimeStart({ generation: 'g2', fresh: false })
    expect(view.text()).toContain('select it again in Stories')
  })
})
