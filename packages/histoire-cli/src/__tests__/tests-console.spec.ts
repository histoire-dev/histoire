import { describe, expect, it, vi } from 'vitest'
import { TerminalError } from '../terminal/protocol/core.js'
import { createRig, operation } from './tests-console-rig.js'

// Boundary: the child and its events are scripted; scope rules, admission, stop and
// the historical judgement are the real implementation. Defects: running a target the
// user did not select, double admission, replaying after a timeout, results of an old
// runtime presented as current.
describe('tests console', () => {
  it('runs exactly the selected scope; story and variant need a target of the current generation', async () => {
    const rig = createRig()
    expect(rig.tests.scopeOptions().map(option => [option.scope, option.available])).toEqual([['all', true], ['story', false], ['variant', false]])
    expect(rig.tests.moveScope(1)).toBe(false)

    rig.select({ scope: 'variant', storyId: 'b', variantId: 'two' })
    // The hand-over is the explicit retarget.
    expect(rig.tests.selectedScope()).toBe('variant')
    expect(rig.tests.moveScope(-1)).toBe(true)
    expect(rig.tests.selectedScope()).toBe('story')
    rig.tests.selectScope('variant')
    await rig.tests.run()
    expect(rig.admitted).toEqual([{ scope: 'variant', storyId: 'b', variantId: 'two' }])

    // After a restart the remembered target is unresolved: it cannot be selected or run.
    rig.state.onEvent('g1', 'tests.state', operation('op1', 'completed'))
    rig.start('g2')
    expect(rig.tests.scopeOptions().find(option => option.scope === 'variant')).toMatchObject({ available: false })
    expect(await rig.tests.run()).toMatchObject({ problem: expect.stringContaining('select it again') })
    expect(rig.admitted).toHaveLength(1)
    expect(rig.tests.selectScope('story')).toBe(false)
  })

  it('refuses a second run while its own operation is active and never replays after a timeout', async () => {
    const rig = createRig()
    expect(await rig.tests.run()).toEqual({ id: 'op1' })
    expect(rig.state.get('op1')!.operation.state).toBe('queued')
    expect(await rig.tests.run()).toMatchObject({ problem: 'A test run is already in progress' })
    expect(rig.admitted).toHaveLength(1)

    rig.emit('tests.state', operation('op1', 'completed'))
    rig.child.run.mockRejectedValueOnce(new TerminalError('timeout', 'tests.run timed out'))
    expect(await rig.tests.run()).toMatchObject({ problem: expect.stringContaining('admission unknown') })
    // One attempt only: no automatic second submission, and a manual one stays possible.
    expect(rig.child.run).toHaveBeenCalledTimes(2)
    expect(rig.tests.busy()).toBe(false)
    expect(await rig.tests.run()).toEqual({ id: 'op2' })
  })

  it('stop cancels every active operation and keeps the cancelling state until the child confirms cleanup', async () => {
    const rig = createRig()
    expect(await rig.tests.stop()).toBe('Nothing to stop')
    const hook = vi.fn(() => 'Watch off')
    rig.tests.onStop(hook)
    await rig.tests.run()
    rig.emit('tests.state', operation('op1', 'running'))
    expect(await rig.tests.stop()).toBe('Cancelling tests, waiting for cleanup. Watch off')
    expect(rig.cancelled).toEqual(['op1'])
    expect(rig.state.get('op1')!.operation.state).toBe('cancelling')
    expect(rig.tests.busy()).toBe(true)
    rig.emit('tests.state', operation('op1', 'cancelled'))
    expect(rig.tests.busy()).toBe(false)
    expect(await rig.tests.run()).toEqual({ id: 'op2' })
  })

  it('labels results historical after a restart or a catalog revision change and never as current success', async () => {
    const rig = createRig()
    await rig.tests.run()
    const summary = { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, retainedCases: 1, omittedCases: 0, runErrors: [], omittedRunErrors: 0, uncollected: [], omittedUncollected: 0 }
    rig.emit('tests.state', operation('op1', 'completed', { summary }))
    const entry = rig.state.get('op1')!
    expect(rig.tests.historical(entry)).toBeUndefined()
    expect(rig.tests.segment()).toBe('tests 1 passed, 0 failed')

    rig.emit('catalog.state', { revision: 'rev2', updating: false, stories: 1, variants: 1, diagnostics: 0 })
    expect(rig.tests.historical(entry)).toBe('stories changed since this run')
    expect(rig.tests.segment()).toBeUndefined()

    rig.start('g2')
    expect(rig.tests.historical(entry)).toBe('runtime restarted since this run')
    // The new run is a separate entry; the old one stays readable beside it.
    await rig.tests.run()
    expect(rig.tests.entries().map(item => item.operation.id)).toEqual(['op2', 'op1'])
    expect(rig.tests.viewed()!.operation.id).toBe('op2')
    rig.tests.moveViewed(1)
    expect(rig.tests.viewed()!.operation.id).toBe('op1')
  })
})
