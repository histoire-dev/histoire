import type { TerminalBridge } from '../bridge.js'
import type { ProgressState } from '../progress/state.js'
import type { TestTarget } from '../protocol/tests.js'
import type { WatchStateDto } from '../protocol/watch.js'
import type { TestsConsole, TestsWatchControl } from '../tests/console.js'
import type { WatchClient } from './client.js'
import { isWatchState } from '../protocol/watch.js'
import { describeTarget } from '../tests/format.js'
import { followOperation } from '../tests/reporter.js'
import { describePhase, describeWatchLine, describeWatchSegment, sameScope } from './format.js'

/** Inputs of the session-lifetime watch controller. */
export interface WatchControllerOptions {
  /** Event source for `watch.state`. */
  bridge: Pick<TerminalBridge, 'subscribe'>
  /** Typed `watch.set` access. */
  client: WatchClient
  /** Generation mirror: sync waits for a ready generation and repeats for every new one. */
  progress: Pick<ProgressState, 'snapshot' | 'subscribe'>
  /** Console owning scope selection, results and stop hooks. */
  tests: TestsConsole
  /** Prints one line (plain mode) or shows transient feedback. */
  report: (line: string) => void
  /** Whether automatic status lines should be printed (plain mode); the TUI shows state in its panel instead. */
  plain: () => boolean
  /** `--test-watch`: start with the whole book. */
  initial?: boolean
}

/**
 * Session-lifetime owner of the watch preference and scope. The preference only
 * describes what the user wants; the child scheduler of the current generation
 * is the only authority that runs or cancels anything. Every new ready
 * generation is told the preference once (child state is generation-scoped),
 * so a config restart keeps watching and runs the retained scope once.
 * @param options Bridge, generation mirror, console and output.
 */
export function createWatchController(options: WatchControllerOptions): TestsWatchControl {
  const { tests, progress } = options
  let preference: { enabled: boolean, scope: TestTarget } = { enabled: options.initial === true, scope: { scope: 'all' } }
  /** What each generation was last told successfully (`off` is the child default). */
  const told = new Map<string, string>()
  const inflight = new Map<string, string>()
  const followed = new Set<string>()
  let observed: { generation: string, state: WatchStateDto } | undefined
  let lastLine: string | undefined
  let lastRuntime: string | undefined
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }
  /** State the child reported for the current generation only. */
  const current = () => {
    const seen = observed
    if (!seen) return undefined
    return seen.generation === progress.snapshot().generation ? seen.state : undefined
  }
  const wanted = () => preference.enabled ? JSON.stringify(preference.scope) : 'off'

  /** Prints one automatic line in plain mode, once per distinct text. */
  function say(line: string | undefined) {
    if (!line || line === lastLine || !options.plain()) return
    lastLine = line
    options.report(line)
  }

  /** Records a state of the current generation and announces it. */
  function accept(generation: string, state: WatchStateDto) {
    if (generation !== progress.snapshot().generation) return
    observed = { generation, state }
    if (preference.enabled && state.enabled) {
      const entry = state.operationId ? tests.state.get(state.operationId) : undefined
      say(describeWatchLine(state, preference.scope, entry ? describeTarget(entry.operation.target) : undefined))
      // Plain mode has no panel: each run is followed to its summary like a manual one.
      if (state.operationId && !followed.has(state.operationId) && options.plain()) {
        followed.add(state.operationId)
        void followOperation(tests, state.operationId, options.report)
      }
    }
    notify()
  }

  /** Tells the ready generation what is wanted; repeats only if the wish changed meanwhile. */
  async function sync(): Promise<void> {
    const snapshot = progress.snapshot()
    const { generation } = snapshot
    if (snapshot.status !== 'ready' || !generation) return
    const key = wanted()
    if ((told.get(generation) ?? 'off') === key || inflight.get(generation) === key) return
    inflight.set(generation, key)
    try {
      const state = await options.client.set(preference.enabled ? { enabled: true, scope: preference.scope } : { enabled: false })
      told.set(generation, key)
      if (told.size > 64) told.delete(told.keys().next().value!)
      if (isWatchState(state)) accept(generation, state)
    }
    catch (error) {
      say(`Watch could not be updated: ${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      inflight.delete(generation)
    }
    if (wanted() !== key) await sync()
  }

  /** Notes, in plain mode, that the runtime itself is between generations. */
  function noteRuntime() {
    const { status, generation } = progress.snapshot()
    if (!preference.enabled || status === 'ready' || status === 'closed') {
      lastRuntime = undefined
      return
    }
    const key = `${status}:${generation}`
    if (key === lastRuntime) return
    lastRuntime = key
    if (status === 'failed') say('Watch paused: the runtime failed to start, it resumes when the problem is fixed')
    else if (status === 'restarting') say('Watch: waiting for the runtime to restart')
  }

  options.bridge.subscribe(({ generation, event, data }) => {
    if (event === 'watch.state' && isWatchState(data)) accept(generation, data)
  })
  progress.subscribe(() => {
    noteRuntime()
    void sync()
    notify()
  })

  /** Applies a new preference and tells the runtime if it is ready. */
  function prefer(enabled: boolean, scope: TestTarget) {
    preference = { enabled, scope }
    lastLine = undefined
    notify()
    return sync()
  }

  const control: TestsWatchControl = {
    async toggle() {
      const selected = tests.runnable()
      if (preference.enabled) {
        // An explicitly chosen different scope retargets; the same scope switches off.
        if (selected.available && selected.target && !sameScope(selected.target, preference.scope)) {
          void prefer(true, selected.target)
          return `Watch retargeted: ${describeTarget(selected.target)}`
        }
        void prefer(false, preference.scope)
        return 'Watch off'
      }
      if (!selected.available || !selected.target) return selected.reason ?? 'Selected scope cannot be watched'
      void prefer(true, selected.target)
      return `Watch on: ${describeTarget(selected.target)}${progress.snapshot().status === 'ready' ? '' : ', starts when the runtime is ready'}`
    },
    active: () => preference.enabled,
    status: () => preference.enabled ? `Watch on · ${describeTarget(preference.scope)} · ${current() ? describePhase(current()!) : 'waiting for the runtime'}` : undefined,
    segment: () => preference.enabled ? describeWatchSegment(current()) : undefined,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }

  /** `s` / plain `stop`: watching is switched off (and the child told) before anything is cancelled. */
  tests.onStop(async () => {
    if (!preference.enabled) return
    await prefer(false, preference.scope)
    return 'Watch off'
  })
  tests.setWatchControl(control)
  void sync()
  return control
}
