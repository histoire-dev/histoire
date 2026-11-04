import type { TerminalBridge } from '../bridge.js'
import type { ProgressState } from '../progress/state.js'
import type { TestTargetHandoff } from '../stories/handoff.js'
import type { TestsClient } from './client.js'
import type { ScopeOption, TestScopeKind } from './scope.js'
import type { TestEntry, TestsState } from './state.js'
import { isCatalogState } from '../protocol/catalog.js'
import { TerminalError } from '../protocol/core.js'
import { TEST_FINAL_STATES } from '../protocol/tests.js'
import { describeSegment } from './format.js'
import { resolveScopeOptions } from './scope.js'

/** Outcome of asking for a run: the admitted operation, or why nothing was admitted. */
export type TestsRunResult = { id: string } | { problem: string }

/** Extra work a stop request ends (the watch ends here, before any cancellation); returns a short note when it did something. */
export type TestsStopHook = () => string | void | Promise<string | void>

/** Watch control registered by the session so `w` and the plain `watch` command have something to toggle. */
export interface TestsWatchControl {
  /** Toggles watching and answers with the new state in words. */
  toggle: () => string | Promise<string>
  /** Whether scheduling is on, for status lines. */
  active: () => boolean
  /** One-line description of the watch (scope and phase) for the tests screen; undefined when off. */
  status: () => string | undefined
  /** Short main-panel text about the watch; undefined when off. */
  segment: () => string | undefined
  /** Observes watch changes so screens repaint. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/** Inputs of the console controller. */
export interface TestsConsoleOptions {
  /** Cache of observed operations (fed by bridge events). */
  state: TestsState
  /** Typed `tests.*` operations. */
  client: TestsClient
  /** Command bridge; only its events are read here (catalog revisions). */
  bridge: Pick<TerminalBridge, 'subscribe'>
  /** Generation mirror: scope targets belong to exactly one runtime generation. */
  progress: Pick<ProgressState, 'snapshot' | 'subscribe'>
  /** Target handed over by the stories screen. */
  handoff: TestTargetHandoff
}

/**
 * Session-lifetime controller shared by the Tests view, the main panel, and the plain
 * commands: scope selection, admission of manual runs, stop, and the historical/current
 * judgement of every result. It owns no operation model of its own: it only submits and
 * cancels through the child and reads what {@link TestsState} observed.
 */
export interface TestsConsole {
  /** Observed operations and cached result pages. */
  readonly state: TestsState
  /** The three scope options with availability. */
  scopeOptions: () => ScopeOption[]
  /** Scope `r` would run. */
  selectedScope: () => TestScopeKind
  /** Explicit scope change; refuses (returns false) a scope that cannot run. */
  selectScope: (scope: TestScopeKind) => boolean
  /** Moves to the next available scope in a direction; returns false at an edge. */
  moveScope: (direction: 1 | -1) => boolean
  /** The selected scope when it can run, otherwise why not. */
  runnable: () => ScopeOption
  /** Tracked operations, newest first. */
  entries: () => TestEntry[]
  /** Operation whose results are shown: the picked one, else the newest. */
  viewed: () => TestEntry | undefined
  /** Picks an older (+1) or newer (-1) operation by ID; the pick stays on that ID. */
  moveViewed: (direction: 1 | -1) => void
  /** Why an entry no longer describes the running server, or undefined when it is current. */
  historical: (entry: TestEntry) => string | undefined
  /** A run of this console is being admitted or has not finished. */
  busy: () => boolean
  /** Latest admission problem (busy, unavailable, timeout, unknown target), cleared by the next attempt. */
  problem: () => string | undefined
  /** Submits the selected scope. Never throws and never retries. */
  run: () => Promise<TestsRunResult>
  /** Ends terminal work: registered hooks first, then cancels every active operation. Resolves with a one-line outcome. */
  stop: () => Promise<string>
  /** Registers extra work `stop` ends; returns a remover. */
  onStop: (hook: TestsStopHook) => () => void
  /** Registers the watch toggle; returns a remover. */
  setWatchControl: (control: TestsWatchControl) => () => void
  /** Toggles watching or says it is not available. */
  toggleWatch: () => Promise<string>
  /** Whether a watch control reports scheduling on. */
  watching: () => boolean
  /** Description of the watch for the tests screen, when it is on. */
  watchStatus: () => string | undefined
  /** Short main-panel segment about the newest operation. */
  segment: () => string | undefined
  /** Observes any change a screen would show. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void
}

/** Operations still in flight (not final, not lost with their generation). */
const isActive = (entry: TestEntry) => !entry.lost && !TEST_FINAL_STATES.includes(entry.operation.state)

/**
 * Creates the controller. Subscriptions live as long as the session.
 * @param options State, client, generation mirror and target handoff.
 */
export function createTestsConsole(options: TestsConsoleOptions): TestsConsole {
  const { state, client, progress, handoff } = options
  const listeners = new Set<() => void>()
  const stopHooks = new Set<TestsStopHook>()
  let watch: TestsWatchControl | undefined
  let unwatch: (() => void) | undefined
  let scope: TestScopeKind = 'all'
  let submitting = false
  let ownedId: string | undefined
  let problem: string | undefined
  let pickedId: string | undefined
  /** Revision of the latest catalog the running generation published. */
  let catalog: { generation: string, revision: string } | undefined

  /** Notifies subscribers; a faulty listener never breaks the others. */
  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch {}
    }
  }

  state.subscribe(notify)
  progress.subscribe(notify)
  // An explicit hand-over from Stories is the only thing that retargets the selection.
  handoff.subscribe(() => {
    const selection = handoff.current()
    if (selection) scope = selection.target.scope
    notify()
  })
  options.bridge.subscribe(({ generation, event, data }) => {
    if (event !== 'catalog.state' || !isCatalogState(data) || data.revision === undefined || data.updating) return
    catalog = { generation, revision: data.revision }
    notify()
  })

  const generation = () => progress.snapshot().generation
  const scopeOptions = () => resolveScopeOptions(handoff.current(), generation())
  const entries = () => [...state.snapshot()].reverse()

  /** Option of the selected scope. */
  const runnable = () => scopeOptions().find(option => option.scope === scope)!

  /** Text for an admission failure. */
  function describeFailure(error: unknown): string {
    if (error instanceof TerminalError) {
      if (error.code === 'timeout') return 'Run request timed out, admission unknown. Check this screen before running again'
      if (error.code === 'busy') return 'Another test operation is queued, try again when it finishes'
      if (error.code === 'unavailable') return `Tests are unavailable: ${error.message}`
      return error.message
    }
    return error instanceof Error ? error.message : String(error)
  }

  const api: TestsConsole = {
    state,
    scopeOptions,
    selectedScope: () => scope,
    selectScope(next) {
      if (!scopeOptions().find(option => option.scope === next)?.available) return false
      scope = next
      notify()
      return true
    },
    moveScope(direction) {
      const available = scopeOptions().filter(option => option.available)
      const index = available.findIndex(option => option.scope === scope)
      // A selection that became unavailable moves to the nearest available edge.
      const next = index < 0 ? available[direction === 1 ? 0 : available.length - 1] : available[index + direction]
      return next ? api.selectScope(next.scope) : false
    },
    runnable,
    entries,
    viewed() {
      const all = entries()
      return all.find(entry => entry.operation.id === pickedId) ?? all[0]
    },
    moveViewed(direction) {
      const all = entries()
      const index = Math.max(0, all.findIndex(entry => entry.operation.id === api.viewed()?.operation.id))
      const next = all[Math.min(all.length - 1, Math.max(0, index + direction))]
      // Back on the newest entry the pick is released, so new runs show up again.
      pickedId = next && next !== all[0] ? next.operation.id : undefined
      notify()
    },
    historical(entry) {
      if (entry.lost) return 'runtime ended before the run finished'
      if (entry.generation !== generation()) return 'runtime restarted since this run'
      if (catalog?.generation === entry.generation && catalog.revision !== entry.operation.revision) return 'stories changed since this run'
      return undefined
    },
    busy() {
      if (submitting) return true
      const owned = ownedId === undefined ? undefined : state.get(ownedId)
      return owned !== undefined && isActive(owned)
    },
    problem: () => problem,
    async run() {
      if (api.busy()) return { problem: 'A test run is already in progress' }
      const option = runnable()
      if (!option.available || !option.target) {
        problem = option.reason ?? 'Scope cannot run'
        notify()
        return { problem }
      }
      submitting = true
      problem = undefined
      pickedId = undefined
      notify()
      try {
        const operation = await client.run(option.target)
        ownedId = operation.id
        // The reply is the first sight of the operation; events keep it current afterwards.
        const owner = generation()
        if (owner) state.onEvent(owner, 'tests.state', operation)
        return { id: operation.id }
      }
      catch (error) {
        problem = describeFailure(error)
        return { problem }
      }
      finally {
        submitting = false
        notify()
      }
    },
    async stop() {
      const notes: string[] = []
      for (const hook of [...stopHooks]) {
        try {
          const note = await hook()
          if (note) notes.push(note)
        }
        catch (error) {
          notes.push(`Stop failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const active = entries().filter(isActive)
      const results = await Promise.allSettled(active.map(entry => client.cancel(entry.operation.id)))
      // Cancelling stays visible until the child reports the final state; the reply only confirms the request.
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') state.onEvent(active[index].generation, 'tests.state', result.value)
        else notes.push(`Cancel failed: ${describeFailure(result.reason)}`)
      })
      if (active.length) notes.unshift(active.length === 1 ? 'Cancelling tests, waiting for cleanup' : `Cancelling ${active.length} test operations, waiting for cleanup`)
      return notes.join('. ') || 'Nothing to stop'
    },
    onStop(hook) {
      stopHooks.add(hook)
      return () => void stopHooks.delete(hook)
    },
    setWatchControl(control) {
      unwatch?.()
      watch = control
      unwatch = control.subscribe(notify)
      notify()
      return () => {
        if (watch !== control) return
        unwatch?.()
        unwatch = watch = undefined
        notify()
      }
    },
    toggleWatch: async () => watch ? watch.toggle() : 'Watch is not available yet',
    watching: () => watch?.active() === true,
    watchStatus: () => watch?.status(),
    segment() {
      const newest = entries()[0]
      const tests = describeSegment(newest, newest ? api.historical(newest) !== undefined : false)
      return [watch?.segment(), tests].filter(Boolean).join(' · ') || undefined
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return api
}
