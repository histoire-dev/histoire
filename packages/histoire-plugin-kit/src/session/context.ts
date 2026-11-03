import type { HistoireReadonly, HistoireSelectionInput, HistoireSnapshot } from '@histoire/protocol'
import type { PluginFrameService } from '../host/frames.js'
import type { Disposer } from '../types/common.js'
import type { WorkbenchCapability, WorkbenchContext, WorkbenchSelection, WorkbenchSource } from '../types/context.js'
import type { CatalogService, DevEventService, NavigationService, TestsService } from '../types/services.js'
import { PLUGIN_FRAMES_SERVICE } from '../host/frames.js'
import { createScope } from '../host/generation.js'

/**
 * Public session methods a session context reads. `HistoireSession` from `@histoire/sdk`
 * satisfies it structurally; plugin-kit never imports the SDK.
 */
export interface SessionContextSource {
  /** Latest coherent snapshot; only `source` and `selection` are read. */
  getSnapshot: () => HistoireReadonly<Pick<HistoireSnapshot, 'source' | 'selection'>>
  /** Observes snapshot publications. */
  subscribe: (listener: () => void) => Disposer
  /** Metadata-only catalog. */
  catalog: CatalogService
  /** Canonical selection; the default navigation selects stories through it. */
  selection?: { select: (input: HistoireSelectionInput) => Promise<unknown> }
}

/** Inputs of {@link createSessionContext}. */
export interface SessionContextOptions {
  /** Session the context reads. */
  session: SessionContextSource
  /** Story source mode; `remote` (no dev-only contributions) by default. */
  mode?: WorkbenchSource['mode']
  /** Navigation; defaults to {@link createSessionNavigation}. */
  navigation?: NavigationService
  /** Dev event service; absent without a compatible dev transport. */
  devEvents?: DevEventService
  /** Project test runs; adds the `tests` capability. */
  tests?: TestsService
  /** Frame messaging; adds the `frames` capability (see `createSessionFrameService`). */
  frames?: PluginFrameService
}

/** Root context plus the generation scopes actions capture. */
export interface SessionContext {
  /** Root-scoped context, e.g. `services.context` of `createExtensionHost`. */
  readonly context: WorkbenchContext
  /** Aborted at the next selection or source change. */
  selectionSignal: () => AbortSignal
  /** Aborted at the next source change (new source id, URL or epoch). */
  sourceSignal: () => AbortSignal
  /** Releases the session subscription and retires every scope. */
  close: () => void
}

/**
 * Navigation for hosts without workbench routes: stories are selected through the session;
 * tabs, panes, settings and canvas views do not exist and are ignored with a warning, so a
 * plugin never changes a host-owned URL.
 * @param session Session selecting stories.
 * @param warn Receives ignored destinations; `console.warn` by default.
 */
export function createSessionNavigation(session: Pick<SessionContextSource, 'selection'>, warn: (message: string) => void = message => console.warn(message)): NavigationService {
  const ignore = (kind: string) => (id?: string) => warn(`[histoire plugin] ${kind} "${id ?? ''}" is not available in this host`)
  return Object.freeze({
    selectStory: async (input: HistoireSelectionInput) => {
      if (!session.selection) throw Object.assign(new Error('[histoire plugin] story selection is not available in this host'), { code: 'CAPABILITY_UNAVAILABLE' })
      await session.selection.select(input)
    },
    openInspectorTab: ignore('inspector tab'),
    openPane: ignore('pane'),
    openSettings: ignore('settings section'),
    openCanvasView: ignore('canvas view'),
  })
}

/**
 * Key of the source generation. Revisions (content publications) keep the generation:
 * a story edit must not abort unrelated pending actions.
 * @param session Session.
 */
function sourceKey(session: SessionContextSource): string {
  const source = session.getSnapshot().source
  return source ? JSON.stringify([source.url, source.sourceId, source.epoch]) : ''
}

/**
 * Key of the selected target.
 * @param session Session.
 */
function selectionKey(session: SessionContextSource): string {
  const target = session.getSnapshot().selection
  return target ? JSON.stringify([target.storyId, target.variantId]) : ''
}

/**
 * Snapshot of the selection exposed on the context; same object until the target changes.
 * @param session Session.
 */
function freezeSelection(session: SessionContextSource): WorkbenchSelection {
  const target = session.getSnapshot().selection
  return Object.freeze({ target: target ? Object.freeze({ storyId: target.storyId, variantId: target.variantId }) : null })
}

/**
 * Creates a root-scoped context from public session methods (standalone workbench, native Vue,
 * React and plain DOM hosts share it). Selection and source changes rotate generation scopes;
 * actions capture the current scope when they start, so a later change aborts them.
 * @param options Session, mode and services.
 */
export function createSessionContext(options: SessionContextOptions): SessionContext {
  const { session } = options
  const lifetime = createScope()
  const listeners = new Set<() => void>()
  let source = { key: sourceKey(session), scope: lifetime.child() }
  let selection = { key: selectionKey(session), scope: source.scope.child(), value: freezeSelection(session) }

  /**
   * Rotates scopes whose key changed. Called on every publication and before handing out a
   * signal, so a caller reading synchronously after a change never captures a stale scope.
   * @returns Whether a context value changed.
   */
  function synchronize(): boolean {
    if (!lifetime.active) return false
    const nextSource = sourceKey(session)
    const nextSelection = selectionKey(session)
    if (nextSource === source.key && nextSelection === selection.key) return false
    if (nextSource !== source.key) {
      // Retiring the source scope also retires its selection child.
      source.scope.retire()
      source = { key: nextSource, scope: lifetime.child() }
    }
    else {
      selection.scope.retire()
    }
    selection = { key: nextSelection, scope: source.scope.child(), value: freezeSelection(session) }
    return true
  }

  const stop = session.subscribe(() => {
    if (!synchronize()) return
    for (const listener of [...listeners]) listener()
  })

  const capabilities = new Set<WorkbenchCapability>(['catalog', 'navigation', 'preferences'])
  if (options.devEvents) capabilities.add('devEvents')
  if (options.frames) capabilities.add('frames')
  if (options.tests) capabilities.add('tests')
  const context: WorkbenchContext = {
    capabilities,
    source: Object.freeze({ mode: options.mode ?? 'remote' }),
    // Bound methods only: plugins never receive the session object.
    catalog: Object.freeze({
      list: () => session.catalog.list(),
      getStory: (storyId: string) => session.catalog.getStory(storyId),
      search: (query: string) => session.catalog.search(query),
    }),
    get selection() {
      synchronize()
      return selection.value
    },
    navigation: options.navigation ?? createSessionNavigation(session),
    ...(options.devEvents ? { devEvents: options.devEvents } : {}),
    ...(options.tests ? { tests: options.tests } : {}),
    subscribe(listener): Disposer {
      if (!lifetime.active) return () => {}
      const entry = (): void => listener()
      listeners.add(entry)
      return () => void listeners.delete(entry)
    },
  }
  // plugin-kit reads the frame service from the root context under its shared symbol.
  if (options.frames) Object.defineProperty(context, PLUGIN_FRAMES_SERVICE, { value: options.frames })

  return {
    context: Object.freeze(context),
    selectionSignal() {
      synchronize()
      return selection.scope.signal
    },
    sourceSignal() {
      synchronize()
      return source.scope.signal
    },
    close() {
      if (!lifetime.active) return
      lifetime.retire()
      stop()
      listeners.clear()
    },
  }
}
