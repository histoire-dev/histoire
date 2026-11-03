import type { Disposer, PluginChannel, PluginFrameRef, WorkbenchPluginApi } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { AuditReport, AuditUpdate } from '../messages.js'
import type { NodeFinding } from './locate.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { send } from '../messages.js'
import { normalizeOptions } from '../options.js'
import { nodeKey } from '../scanner/run.js'
import { matchNode } from './locate.js'

/** Wait for an inspector tab to open a frame visit after navigation; slow variants load late. */
const VISIT_TIMEOUT = 30_000

/** Observable audit state for one exact actor. */
export interface AuditState {
  /** Latest successful report. */
  report?: AuditReport
  /** Report owning private highlight handles. */
  reportId?: number
  /** Active scan. */
  running: boolean
  /** Report may no longer describe current DOM. */
  stale: boolean
  /** Scan failure, without discarding prior report. */
  error?: string
  /** Highlight feedback. */
  feedback?: string
}

/** Actor record and its view-scoped channel subscription. */
interface Entry {
  /** Exact attached frame. */
  frame: PluginFrameRef
  /** Current immutable UI state. */
  state: AuditState
  /** Visit-scoped channel. */
  channel?: PluginChannel
  /** Active visit identity. */
  visit?: string
  /** Last accepted request. */
  request: number
  /** Message listener disposal. */
  stop?: Disposer
}

/** Maintain isolated reports, preferences and channel visits for one extension host. */
export function createAuditModel(api: WorkbenchPluginApi) {
  const options = normalizeOptions(api.options as Parameters<typeof normalizeOptions>[0])
  const entries = new Map<string, Entry>()
  const watchers = new Map<string, Set<() => void>>()
  /** Pending {@link until} checks, re-evaluated on every change. */
  const waiters = new Set<() => void>()
  let disposed = false

  /** Notify subscribed views and refresh inspector badge. */
  function notify(): void {
    for (const set of watchers.values()) {
      for (const listener of set) listener()
    }
    for (const waiter of [...waiters]) waiter()
    api.invalidate()
  }

  /**
   * Resolve with the first truthy value of `read`, re-read on every model change; `undefined`
   * after `timeoutMs` or once the plugin retires.
   */
  function until<T>(read: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      function check(): void {
        const value = disposed ? undefined : read()
        if (value || disposed) done(value)
      }
      function done(value: T | undefined): void {
        waiters.delete(check)
        clearTimeout(timer)
        resolve(value)
      }
      timer = setTimeout(done, timeoutMs, undefined)
      waiters.add(check)
      check()
    })
  }

  /** Current live-auditing preference, guarded against invalid stored values. */
  function autoRun(): boolean {
    const saved = api.preferences.get('autoRun', options.autoRun)
    return typeof saved === 'boolean' ? saved : options.autoRun
  }

  /** End visit before asynchronous messages can publish into successor. */
  function stop(entry: Entry): void {
    if (entry.channel && entry.visit) void send(entry.channel, 'stop', { visit: entry.visit }).catch(() => {})
    entry.stop?.()
    entry.stop = undefined
    entry.channel = undefined
    entry.visit = undefined
    entry.state = { ...entry.state, running: false, stale: true }
  }

  /** Start actor-bound visit only while a view observes this frame. */
  function start(entry: Entry): void {
    if (entry.channel || disposed) return
    try {
      const channel = api.frames.open(entry.frame)
      const visit = crypto.randomUUID()
      entry.channel = channel
      entry.visit = visit
      entry.stop = channel.on('update', (value) => {
        const data = value as unknown as AuditUpdate
        if (!data || data.visit !== entry.visit || entries.get(entry.frame.key) !== entry || !Number.isInteger(data.request) || data.request < entry.request) return
        entry.request = data.request
        entry.state = {
          ...entry.state,
          ...data.running !== undefined ? { running: data.running, error: undefined, feedback: undefined } : {},
          ...data.stale !== undefined ? { stale: data.stale } : {},
          ...data.report ? { report: data.report, reportId: data.reportId, error: undefined } : {},
          ...data.error ? { error: data.error } : {},
          ...data.feedback ? { feedback: data.feedback } : {},
        }
        notify()
      })
      void send(channel, 'activate', { visit, autoRun: autoRun() }).catch((error) => {
        if (entry.visit !== visit) return
        entry.state = { ...entry.state, running: false, error: String(error) }
        notify()
      })
    }
    catch { /* Actor retired between list and open; next frame notification retries. */ }
  }

  /** Retire replaced actors and attach waiting views to their exact successors. */
  function sync(): void {
    if (disposed) return
    const frames = api.frames.list()
    const live = new Set(frames.map(frame => frame.key))
    for (const [key, entry] of entries) {
      if (!live.has(key)) {
        stop(entry)
        entries.delete(key)
      }
    }
    for (const frame of frames) {
      let entry = entries.get(frame.key)
      if (entry?.frame.actorId !== frame.actorId) {
        if (entry) stop(entry)
        entry = { frame, state: { running: false, stale: true }, request: 0 }
        entries.set(frame.key, entry)
      }
      if (watchers.get(frame.key)?.size) start(entry!)
    }
    notify()
  }

  const stopFrames = api.frames.subscribe(sync)
  const stopAutoRun = api.preferences.subscribe('autoRun', () => {
    for (const entry of entries.values()) {
      if (entry.channel && entry.visit) void send(entry.channel, 'configure', { visit: entry.visit, autoRun: autoRun() }).catch(() => {})
    }
    notify()
  })
  api.signal.addEventListener('abort', () => {
    disposed = true
    for (const entry of entries.values()) stop(entry)
    for (const waiter of [...waiters]) waiter()
    stopFrames()
    stopAutoRun()
    entries.clear()
    watchers.clear()
  }, { once: true })
  sync()

  return {
    autoRun,
    preferences: api.preferences,
    /** Current result belonging to exact frame key. */
    get: (key: string) => entries.get(key)?.state,
    /** Observe visit; final observer closes it and automatic scanning. */
    watch(key: string, listener: () => void): Disposer {
      if (disposed) return () => {}
      const set = watchers.get(key) ?? new Set()
      watchers.set(key, set)
      set.add(listener)
      const entry = entries.get(key)
      if (entry) start(entry)
      listener()
      return () => {
        set.delete(listener)
        if (!set.size) {
          watchers.delete(key)
          const current = entries.get(key)
          if (current) stop(current)
        }
      }
    },
    /** Request one scan without enabling automatic work. */
    run(key: string): void {
      const entry = entries.get(key)
      if (entry?.channel && entry.visit) void send(entry.channel, 'run', { visit: entry.visit }).catch(api.reportError)
    },
    /** Highlight exact node from latest successful report. */
    highlight(key: string, node: string): void {
      const entry = entries.get(key)
      if (entry?.channel && entry.visit) void send(entry.channel, 'highlight', { visit: entry.visit, reportId: entry.state.reportId, node }).catch(api.reportError)
    },
    /**
     * Highlight an element reported elsewhere (project run, build report) in the variant's
     * frame. Needs the inspector tab to hold that frame's visit; checks it again first when its
     * live report is missing or outdated, then highlights the matching live element.
     * @param target Variant of the finding.
     * @param finding Element to highlight.
     */
    async locate(target: HistoireTarget, finding: NodeFinding): Promise<void> {
      const key = getHistoireTargetKey(target)
      const entry = await until(() => [...entries.values()].find(entry => entry.channel && getHistoireTargetKey(entry.frame.target) === key), VISIT_TIMEOUT)
      if (!entry) return
      const fresh = () => entry.state.report && !entry.state.running && !entry.state.stale && entries.get(entry.frame.key) === entry ? entry.state.report : undefined
      if (!fresh()) this.run(entry.frame.key)
      const report = await until(fresh, options.timeoutMs + VISIT_TIMEOUT)
      const node = report && matchNode(report, finding)
      if (node) return this.highlight(entry.frame.key, nodeKey(finding.outcome, finding.rule, node.selectors))
      if (entries.get(entry.frame.key) !== entry) return
      entry.state = { ...entry.state, feedback: 'Element not found; run checks again' }
      notify()
    },
  }
}

/** Model type passed directly to plugin views. */
export type AuditModel = ReturnType<typeof createAuditModel>
