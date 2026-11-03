import type { HistoireJsonValue, HistoireTarget } from '@histoire/protocol'
import type { Disposer } from '../types/common.js'
import type { WorkbenchContext } from '../types/context.js'
import type { ContributionKind, WorkbenchContribution } from '../types/contribution.js'
import type { WorkbenchPluginApi } from '../types/plugin.js'
import type { PluginPreferences } from '../types/preferences.js'
import type { TestsService } from '../types/services.js'
import { createPluginFrames } from './frames.js'
import { NOOP } from './resources.js'

/** Inputs of one plugin's API object. */
export interface PluginApiOptions {
  /** Plugin id. */
  id: string
  /** Browser-visible options. */
  options: HistoireJsonValue | undefined
  /** Root context; wrapped so subscriptions are plugin-owned. */
  context: WorkbenchContext
  /** Plugin preferences. */
  preferences: PluginPreferences
  /** Plugin scope signal. */
  signal: AbortSignal
  /** Owned registration. */
  contribute: (contribution: WorkbenchContribution) => Disposer
  /** Attributed error report. */
  reportError: (error: unknown) => void
  /** Ties a resource to the plugin lifetime. */
  track: (release: () => void) => Disposer
  /** Notifies host subscribers so surfaces re-read plugin callbacks; inert after retirement. */
  invalidate: () => void
}

/**
 * Wraps the root context so `subscribe` is owned by the plugin and released with it.
 * The proxy targets an empty object so frozen contexts never violate proxy invariants;
 * every other property reads through to the live context (getters stay fresh).
 * @param context Root context.
 * @param signal Plugin scope signal; subscriptions after retirement are refused.
 * @param track Ties a subscription to the plugin lifetime.
 */
function createOwnedContext(context: WorkbenchContext, signal: AbortSignal, track: (release: () => void) => Disposer): WorkbenchContext {
  const subscribe: WorkbenchContext['subscribe'] = listener => signal.aborted ? NOOP : track(context.subscribe(listener))
  const tests = context.tests && createOwnedTests(context.tests, signal, track)
  return new Proxy({} as WorkbenchContext, {
    get: (_, key) => key === 'subscribe' ? subscribe : key === 'tests' ? tests : Reflect.get(context, key, context),
    has: (_, key) => Reflect.has(context, key),
    ownKeys: () => Reflect.ownKeys(context),
    getOwnPropertyDescriptor(_, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(context, key)
      if (!descriptor) return undefined
      if (key === 'subscribe') return { value: subscribe, writable: false, enumerable: descriptor.enumerable, configurable: true }
      if (key === 'tests') return { value: tests, writable: false, enumerable: descriptor.enumerable, configurable: true }
      return { ...descriptor, configurable: true }
    },
  })
}

/**
 * Wraps the tests service so its subscriptions are owned by the plugin; getters read through.
 * @param tests Host tests service.
 * @param signal Plugin scope signal; subscriptions after retirement are refused.
 * @param track Ties a subscription to the plugin lifetime.
 */
function createOwnedTests(tests: TestsService, signal: AbortSignal, track: (release: () => void) => Disposer): TestsService {
  return Object.freeze({
    entries: () => tests.entries(),
    get running() {
      return tests.running
    },
    get canRun() {
      return tests.canRun
    },
    get progress() {
      return tests.progress
    },
    get error() {
      return tests.error
    },
    runAll: () => tests.runAll(),
    run: (target: HistoireTarget) => tests.run(target),
    subscribe: (listener: () => void) => signal.aborted ? NOOP : track(tests.subscribe(listener)),
  })
}

/**
 * Builds `WorkbenchPluginApi`; typed helpers are sugar over `contribute`.
 * @param options Plugin identity, services and ownership hooks.
 */
export function createPluginApi(options: PluginApiOptions): WorkbenchPluginApi {
  const { contribute } = options

  /**
   * Helper adding contributions of one kind; `WorkbenchPluginApi` types each input shape.
   * @param kind Contribution kind stamped on each input.
   */
  const add = (kind: ContributionKind) =>
    (input: object): Disposer => contribute({ ...input, kind } as WorkbenchContribution)

  return {
    id: options.id,
    options: options.options,
    context: createOwnedContext(options.context, options.signal, options.track),
    preferences: options.preferences,
    signal: options.signal,
    contribute,
    inspector: { addTab: add('inspector.tab'), addSection: add('inspector.section') },
    toolbar: { addItem: add('toolbar.item') },
    commands: { add: add('command') },
    shortcuts: { add: add('shortcut') },
    menus: { addFrameAction: add('frame-menu.item'), addContextAction: add('context-menu.item') },
    canvas: {
      addOverlay: add('canvas.overlay'),
      addFrameOverlay: add('canvas.frame-overlay'),
      addFrameBadge: add('canvas.frame-badge'),
      addTool: add('canvas.tool'),
      addView: add('canvas.view'),
    },
    shell: { addPane: add('shell.pane') },
    settings: { addSection: add('settings.section') },
    home: { addSection: add('home.section') },
    frames: createPluginFrames(options),
    reportError: options.reportError,
    invalidate: options.invalidate,
  }
}
