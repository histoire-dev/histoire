import type { ProgressEvent } from '../terminal/protocol/progress.js'
import { expect, it } from 'vitest'
import { describeProgress, describeRestartCause } from '../terminal/progress/format.js'
import { createProgressState } from '../terminal/progress/state.js'

// Boundary: the real parent state machine driven by the same calls `dev.ts`
// makes, with an injected monotonic clock. Defects: superseded generations
// advancing their successor, failures vanishing, fabricated counts, restart
// cause lost between the notice and the generation it explains.
const started = (phase: ProgressEvent['phase'], extra: Partial<ProgressEvent> = {}): ProgressEvent => ({ phase, status: 'started', ...extra })

/** State plus a controllable clock. */
function setup() {
  let time = 1000
  const state = createProgressState({ now: () => time })
  return { state, advance: (ms: number) => time += ms }
}

it('tracks live elapsed time, real counts and the failed phase of one generation', () => {
  const { state, advance } = setup()
  state.onRuntimeStart({ generation: 'g1', fresh: false })
  state.onProgress('g1', started('config'))
  advance(250)
  expect(state.snapshot().active).toMatchObject([{ phase: 'config', elapsedMs: 250 }])
  state.onProgress('g1', { phase: 'config', status: 'completed', durationMs: 260 })
  state.onProgress('g1', started('collect'))
  // A count without a denominator is never published as progress.
  state.onProgress('g1', { phase: 'collect', status: 'updated', current: 3 })
  expect(state.snapshot().active[0]).not.toHaveProperty('current')
  state.onProgress('g1', { phase: 'collect', status: 'updated', current: 3, total: 8 })
  expect(describeProgress(state.snapshot())).toBe('Collecting stories 3/8 0ms')
  state.onProgress('g1', { phase: 'collect', status: 'failed', durationMs: 40, error: 'boom' })
  state.onStatus({ status: 'failed' })
  const snapshot = state.snapshot()
  expect(snapshot.failed).toMatchObject({ phase: 'collect', error: 'boom', elapsedMs: 40 })
  expect(snapshot.phases.map(phase => phase.phase)).toEqual(['config', 'collect'])
  // Wall time stops with the failure.
  advance(5000)
  expect(state.snapshot().elapsedMs).toBe(snapshot.elapsedMs)
})

it('fences superseded and retired generations and attaches the restart cause to the successor', () => {
  const { state, advance } = setup()
  state.onRuntimeStart({ generation: 'g1', fresh: false })
  state.onProgress('g1', started('collect'))
  state.onStatus({ status: 'ready' })
  advance(100)
  state.onRestart({ kind: 'config', source: 'Vite: vite.config.ts', fresh: false })
  state.onRetired('g1')
  state.onStatus({ status: 'restarting' })
  expect(state.snapshot()).toMatchObject({ status: 'restarting', cause: { kind: 'config' }, phases: [] })
  // Late frame of the retired generation, before and after the successor spawned.
  state.onProgress('g1', { phase: 'collect', status: 'completed', durationMs: 1 })
  state.onRuntimeStart({ generation: 'g2', fresh: true })
  state.onProgress('g2', started('config'))
  state.onProgress('g1', started('vite'))
  state.onProgress('g1', { phase: 'config', status: 'completed', durationMs: 1 })
  expect(state.snapshot()).toMatchObject({ generation: 'g2', fresh: true, cause: { kind: 'config', source: 'Vite: vite.config.ts' } })
  expect(state.snapshot().phases).toMatchObject([{ phase: 'config', status: 'running' }])
  // Retirement interrupts running work instead of leaving it looking active.
  state.onRetired('g2')
  expect(state.snapshot()).toMatchObject({ active: [], phases: [{ phase: 'config', status: 'interrupted' }] })
})

it('names each restart cause once in plain lines', () => {
  expect(describeRestartCause({ kind: 'config', source: 'Histoire: histoire.config.ts', fresh: false })).toBe('Config changed, restarting (Histoire: histoire.config.ts)...')
  expect(describeRestartCause({ kind: 'manual', fresh: true })).toContain('fresh')
  expect(describeRestartCause({ kind: 'browser', fresh: false })).toBe('Restart requested from the browser...')
  expect(describeRestartCause({ kind: 'exit', source: 'Histoire runtime exited (SIGKILL)', fresh: false })).toBe('Histoire runtime exited (SIGKILL), restarting...')
  expect(describeRestartCause({ kind: 'runtime', source: 'Installed @histoire/plugin-a11y', fresh: true })).toBe('Installed @histoire/plugin-a11y, restarting fresh...')
})
