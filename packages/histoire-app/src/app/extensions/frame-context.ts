import type { Disposer, FrameHeaderContext, FrameRef, FrameRuntimeView, FrameScopedContext, WorkbenchContext } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { RootContext } from './context.js'
import { createScope } from '@histoire/plugin-kit'
import { getHistoireTargetKey } from '@histoire/protocol'

/** Public SDK methods of one frame session a frame context reads. */
export type FrameSession = Pick<HistoireSession, 'getSnapshot' | 'subscribe'>

/** Context captured with the scope whose retirement aborts actions run against it. */
export interface ScopedContext<C extends WorkbenchContext = WorkbenchContext> {
  /** Captured context. */
  readonly context: C
  /** Aborted when the captured target scope retires. */
  readonly signal: AbortSignal
}

/** Frame-scoped context with an explicit lifetime. */
export interface FrameContextHandle extends ScopedContext<FrameScopedContext> {
  /** Retires the scope and releases subscriptions made through the context; idempotent. */
  retire: () => void
}

/** Inputs of one frame-scoped context. */
export interface FrameContextOptions {
  /** Frame identity; fixed for the scope lifetime. */
  frame: FrameRef
  /** Exact session owning the frame. */
  session: FrameSession
  /** Extra parent scope (frame registration, menu lifetime). */
  signal?: AbortSignal
}

/**
 * Creates a context bound to exactly one frame session. Reads and subscriptions never follow
 * the selection: a frame menu action keeps the right-clicked frame. The scope retires with the
 * source generation, the optional caller signal, or `retire()`.
 * @param root Root context.
 * @param options Frame, session and optional parent signal.
 */
export function createFrameContext(root: RootContext, options: FrameContextOptions): FrameContextHandle {
  const scope = createScope(root.sourceSignal(), options.signal)
  const releases = new Set<Disposer>()

  /**
   * Ties a subscription to the scope; late subscriptions after retirement are refused.
   * @param subscribe Starts the subscription and returns its disposer.
   */
  function own(subscribe: () => Disposer): Disposer {
    if (!scope.active) return () => {}
    const stop = subscribe()
    const release = (): void => {
      if (releases.delete(release)) stop()
    }
    releases.add(release)
    return release
  }

  /** Releases owned subscriptions once the scope retires. */
  function release(): void {
    for (const stop of [...releases]) stop()
  }
  if (scope.active) scope.signal.addEventListener('abort', release, { once: true })

  const frame: FrameRef = Object.freeze({ key: options.frame.key, target: Object.freeze({ ...options.frame.target }) })
  const runtime: FrameRuntimeView = Object.freeze({
    getSnapshot: () => options.session.getSnapshot(),
    subscribe: listener => own(() => options.session.subscribe(listener)),
  })
  const { capabilities, source, catalog, navigation, devEvents, tests } = root.context
  const context: FrameScopedContext = Object.freeze({
    capabilities,
    source,
    catalog,
    navigation,
    ...(devEvents ? { devEvents } : {}),
    ...(tests ? { tests } : {}),
    get selection() {
      return root.context.selection
    },
    subscribe: listener => own(() => root.context.subscribe(listener)),
    frame,
    runtime,
  })
  return { context, signal: scope.signal, retire: scope.retire }
}

/**
 * Header contexts of laid-out frames, live or not: the root context plus the frame. Cached per
 * frame key and target so badge callbacks see a stable object.
 * @param root Root context.
 */
export function createFrameHeaderContexts(root: RootContext): (frame: FrameRef) => FrameHeaderContext {
  const cache = new Map<string, FrameHeaderContext>()
  return (input) => {
    const key = `${input.key}\n${getHistoireTargetKey(input.target)}`
    let context = cache.get(key)
    if (!context) {
      const frame: FrameRef = Object.freeze({ key: input.key, target: Object.freeze({ ...input.target }) })
      // Getters read the root context live, so cached entries never hold stale services.
      context = Object.freeze({
        get capabilities() { return root.context.capabilities },
        get source() { return root.context.source },
        get catalog() { return root.context.catalog },
        get navigation() { return root.context.navigation },
        get devEvents() { return root.context.devEvents },
        get tests() { return root.context.tests },
        get selection() { return root.context.selection },
        subscribe: listener => root.context.subscribe(listener),
        frame,
      })
      cache.set(key, context)
    }
    return context
  }
}

/** Frame context following the selected ready frame. */
export interface SelectedFrameContext {
  /** Context of the selected ready frame, or `null` when none is admitted. */
  current: () => FrameContextHandle | null
  /**
   * Publishes the selected frame session (`undefined` when none). A different session retires
   * the previous context, aborting actions captured against it. `frameKey` is the canvas frame
   * id owning the session; see `selectedCanvasFrameKey` for the default.
   */
  publish: (session: FrameSession | undefined, frameKey?: string) => void
  /**
   * Binds the canvas frame registry resolving which frame owns a published session when no
   * `frameKey` is given: frames leased by custom views are keyed `lease:<n>`, not by target.
   * Returns its disposer; the latest binding wins.
   */
  bindFrameKeys: (resolve: (session: FrameSession) => string | undefined) => Disposer
  /** Notified after the current context changed. */
  subscribe: (listener: () => void) => Disposer
  /** Retires the current context and stops publishing. */
  close: () => void
}

/**
 * Canvas frame id of the selected frame rendering `target`. Grid, List and Single key that
 * frame's registry entry by its target key (`frame-layout.ts`, `single-viewport.ts`), and the
 * canvas publishes only that entry's session (`watchCanvasSelectedSession`), so `FrameRef.key`
 * of inspector contexts is the canvas frame id plugin channels and canvas services use.
 * @param target Selected variant.
 */
export function selectedCanvasFrameKey(target: HistoireTarget): string {
  return getHistoireTargetKey(target)
}

/**
 * Tracks the selected frame. Each published session gets a fresh scope under the root
 * selection scope, so a selection change aborts pending actions even before the canvas
 * publishes the next frame.
 * @param root Root context.
 */
export function createSelectedFrameContext(root: RootContext): SelectedFrameContext {
  const listeners = new Set<() => void>()
  let session: FrameSession | undefined
  let handle: FrameContextHandle | null = null
  let closed = false
  let resolveKey: ((session: FrameSession) => string | undefined) | undefined

  /**
   * Builds the context of `owner` when it renders the canonical selection.
   * @param owner Published frame session.
   * @param frameKey Canvas frame id owning the session.
   */
  function create(owner: FrameSession, frameKey?: string): FrameContextHandle | null {
    const target = owner.getSnapshot().selection
    const selected = root.context.selection.target
    // A frame still showing a previous target is not the selected frame.
    if (!target?.variantId || !selected || selected.storyId !== target.storyId || selected.variantId !== target.variantId) return null
    const key = frameKey ?? resolveKey?.(owner) ?? selectedCanvasFrameKey(target)
    return createFrameContext(root, { frame: { key, target }, session: owner, signal: root.selectionSignal() })
  }

  return {
    current: () => handle?.signal.aborted ? null : handle,
    publish(next, frameKey) {
      if (closed) return
      // Same session: keep a live context; retry one that was not admitted yet.
      if (next === session && (handle ? !handle.signal.aborted : !next)) return
      handle?.retire()
      session = next
      handle = next ? create(next, frameKey) : null
      for (const listener of [...listeners]) listener()
    },
    bindFrameKeys(resolve) {
      resolveKey = resolve
      return () => {
        if (resolveKey === resolve) resolveKey = undefined
      }
    },
    subscribe(listener) {
      const entry = (): void => listener()
      listeners.add(entry)
      return () => void listeners.delete(entry)
    },
    close() {
      closed = true
      handle?.retire()
      handle = null
      session = undefined
      listeners.clear()
    },
  }
}
