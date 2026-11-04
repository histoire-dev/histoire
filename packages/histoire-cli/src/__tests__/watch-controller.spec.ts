import type { WatchSetArgs, WatchStateDto } from '../terminal/protocol/watch.js'
import { describe, expect, it } from 'vitest'
import { createWatchClient } from '../terminal/watch/client.js'
import { createWatchController } from '../terminal/watch/controller.js'
import { createRig, operation } from './tests-console-rig.js'
import { flushMicrotasks } from './utils/flush.js'

/** State the scripted child reports. */
const state = (extra: Partial<WatchStateDto> = {}): WatchStateDto => ({ enabled: true, phase: 'idle', pending: 0, runs: 0, ...extra })

/** Console rig plus a scripted child that answers `watch.set` and records the order of everything it is told. */
function createWatchRig(options: { initial?: boolean, plain?: boolean } = {}) {
  const rig = createRig()
  const told: Array<{ generation: string, args: WatchSetArgs }> = []
  const order: string[] = []
  const lines: string[] = []
  const bridge = { send: async (_operation: string, args: WatchSetArgs) => {
    told.push({ generation: rig.progress.snapshot().generation!, args })
    order.push(args.enabled ? 'watch:on' : 'watch:off')
    return state({ enabled: args.enabled, phase: args.enabled ? 'waiting' : 'off', scope: args.scope })
  } }
  const cancel = rig.child.cancel.getMockImplementation()!
  rig.child.cancel.mockImplementation(async (id: string) => {
    order.push('cancel')
    return cancel(id)
  })
  createWatchController({ bridge: rig.bridge, client: createWatchClient(bridge as never), progress: rig.progress, tests: rig.tests, report: line => lines.push(line), plain: () => options.plain ?? true, initial: options.initial })
  return { ...rig, told, order, lines }
}

// Boundary: real console, state, progress mirror and watch controller; the child scheduler is
// scripted, because its behavior is proven separately. Defects: a preference lost across a runtime
// replacement, a duplicate enable per generation, watching continuing after stop, stop cancelling
// work before the watch is switched off, a stale generation's state shown as current.
describe('watch preference', () => {
  it('starts the whole book from the flag without input, once per ready generation, and keeps the scope across restarts', async () => {
    const rig = createWatchRig({ initial: true })
    await flushMicrotasks()
    expect(rig.told).toEqual([{ generation: 'g1', args: { enabled: true, scope: { scope: 'all' } } }])

    rig.progress.onStatus({ status: 'restarting' })
    await flushMicrotasks()
    expect(rig.told).toHaveLength(1)
    rig.start('g2')
    await flushMicrotasks()
    expect(rig.told).toHaveLength(2)
    expect(rig.told[1]).toEqual({ generation: 'g2', args: { enabled: true, scope: { scope: 'all' } } })
    // Further progress traffic of the same generation tells it nothing new.
    rig.progress.onStatus({ status: 'ready' })
    await flushMicrotasks()
    expect(rig.told).toHaveLength(2)
  })

  it('captures the selected scope when enabled, retargets only on an explicit different scope, and never follows scope browsing', async () => {
    const rig = createWatchRig()
    rig.select({ scope: 'variant', storyId: 'b', variantId: 'two' })
    rig.tests.selectScope('variant')
    expect(await rig.tests.toggleWatch()).toMatch(/Watch on: b \/ two/)
    await flushMicrotasks()
    // Moving the selection afterwards is browsing, not retargeting.
    rig.tests.selectScope('all')
    await flushMicrotasks()
    expect(rig.told).toHaveLength(1)
    expect(rig.told[0].args).toEqual({ enabled: true, scope: { scope: 'variant', storyId: 'b', variantId: 'two' } })

    expect(await rig.tests.toggleWatch()).toMatch(/Watch retargeted: all stories/)
    await flushMicrotasks()
    expect(rig.told[1].args).toEqual({ enabled: true, scope: { scope: 'all' } })
    expect(await rig.tests.toggleWatch()).toBe('Watch off')
    await flushMicrotasks()
    expect(rig.told[2].args).toEqual({ enabled: false })
    expect(rig.tests.watching()).toBe(false)
  })

  it('refuses to watch a scope that cannot run', async () => {
    const rig = createWatchRig()
    rig.select({ scope: 'story', storyId: 'b' })
    rig.tests.selectScope('story')
    rig.start('g2')
    expect(await rig.tests.toggleWatch()).toMatch(/select it again/)
    expect(rig.tests.watching()).toBe(false)
    expect(rig.told).toEqual([])
  })

  it('stop switches watching off in the child before cancelling any work, and a later generation stays off', async () => {
    const rig = createWatchRig({ initial: true })
    await flushMicrotasks()
    rig.emit('tests.state', operation('op1', 'running'))
    expect(await rig.tests.stop()).toMatch(/Cancelling tests.*Watch off/)
    expect(rig.order).toEqual(['watch:on', 'watch:off', 'cancel'])
    expect(rig.tests.watching()).toBe(false)
    rig.start('g2')
    await flushMicrotasks()
    expect(rig.told.map(entry => entry.args.enabled)).toEqual([true, false])
    // Fresh explicit enable works afterwards.
    await rig.tests.toggleWatch()
    await flushMicrotasks()
    expect(rig.told.at(-1)).toEqual({ generation: 'g2', args: { enabled: true, scope: { scope: 'all' } } })
  })

  it('shows only the current generation state, and prints plain status and the watched run', async () => {
    const rig = createWatchRig({ initial: true })
    await flushMicrotasks()
    rig.emit('watch.state', state({ phase: 'running', operationId: 'op1', runs: 1 }))
    rig.emit('tests.state', operation('op1', 'running'))
    expect(rig.tests.watchStatus()).toMatch(/Watch on · all stories · running/)
    expect(rig.tests.segment()).toMatch(/watch running/)
    expect(rig.lines).toContain('Watch: running all stories')
    await expect.poll(() => rig.lines).toContain('Starting')

    rig.start('g2')
    // g1 is retired: its late state cannot describe g2.
    rig.emit('watch.state', state({ phase: 'paused', reason: 'old' }), 'g1')
    expect(rig.tests.watchStatus()).not.toMatch(/old/)
    rig.emit('watch.state', state({ phase: 'paused', reason: 'Collection failed: boom' }), 'g2')
    expect(rig.lines.at(-1)).toBe('Watch paused: Collection failed: boom')
  })
})
