import type { DevEventService, ExtensionHost, FrameHeaderContext, FrameRef, StorageLike, TestsService, WorkbenchContext, WorkbenchSource } from '@histoire/plugin-kit'
import type { HistoireFramePluginInfo } from '@histoire/protocol'
import type { ContextSession, RootContext } from './context.js'
import type { FrameChannels } from './frame-channels.js'
import type { FrameContextHandle, FrameSession, ScopedContext, SelectedFrameContext } from './frame-context.js'
import type { WorkbenchNavigationTargets } from './navigation.js'
import type { WorkbenchPluginEntry } from './plugins.js'
import { createExtensionHost } from '@histoire/plugin-kit'
import { createRootContext } from './context.js'
import { createFrameChannels, sessionFramePlugins } from './frame-channels.js'
import { createFrameContext, createFrameHeaderContexts, createSelectedFrameContext } from './frame-context.js'
import { createWorkbenchNavigation } from './navigation.js'
import { toExtensionHostPlugins } from './plugins.js'

/** Inputs of one workbench extension host. */
export interface WorkbenchHostOptions {
  /** Canonical workbench session; only public SDK methods are read. */
  session: ContextSession
  /** Story source mode. */
  mode: WorkbenchSource['mode']
  /** Configured plugin entries in config order. */
  plugins: readonly WorkbenchPluginEntry[]
  /** Existing navigation the navigation service delegates to. */
  navigation: WorkbenchNavigationTargets
  /** Dev event service; absent for static books and remote sources. */
  devEvents?: DevEventService
  /** Project test runs; absent for static books and remote sources. */
  tests?: TestsService
  /** Preference storage; memory only when absent. */
  storage?: StorageLike
  /** Project namespace of preference keys. */
  storageNamespace?: string
  /** Receives diagnostics for ignored navigation; defaults to `console.warn`. */
  warn?: (message: string) => void
  /** Receives each plugin diagnostic once (message, error); defaults to `console.error`. */
  error?: (message: string, error: unknown) => void
  /** Installed frame plugins; defaults to the session's descriptor inventory. */
  framePlugins?: () => readonly HistoireFramePluginInfo[] | undefined
}

/** Extension host of one workbench with the scoped contexts and action runner surfaces share. */
export interface WorkbenchHost {
  /** Plugin registry, lifecycle and diagnostics. */
  readonly host: ExtensionHost
  /** Root-scoped context. */
  readonly context: WorkbenchContext
  /** Context of the selected ready frame (inspector scope). */
  readonly selectedFrame: SelectedFrameContext
  /** Captures the root context with the current selection scope. */
  rootScope: () => ScopedContext
  /** Context of one laid-out frame's header (badges); no runtime, so frames need not be live. */
  frameHeader: (frame: FrameRef) => FrameHeaderContext
  /**
   * Captures a context bound to one explicit frame (frame menu, frame overlays). It survives
   * selection changes and retires with the source generation, `signal` or `retire()`.
   */
  frameScope: (frame: FrameRef, session: FrameSession, signal?: AbortSignal) => FrameContextHandle
  /**
   * The action runner every surface uses: runs an action against a captured scope (root scope
   * captured now when omitted). The promise is the pending state; it rejects with current
   * failures and resolves silently when the scope retired first.
   */
  run: (contributionId: string, scope?: ScopedContext) => Promise<void>
  /** Frame plugin channels; canvases register their frame registries here. */
  readonly frames: Pick<FrameChannels, 'registerFrames'>
  /** Disposes plugins, contexts and subscriptions exactly once. */
  dispose: () => Promise<void>
}

/**
 * Reports each new host diagnostic once, attributed like frame plugin failures, so a plugin that
 * failed to load or set up is never silently missing. The host log is append-only, so the
 * reported count is enough to find new entries.
 * @param host Extension host.
 * @param report Receives the message and the original error.
 */
function reportDiagnostics(host: ExtensionHost, report: (message: string, error: unknown) => void): () => void {
  let reported = 0
  const flush = () => {
    const list = host.diagnostics()
    for (const { pluginId, phase, contributionId, error } of list.slice(reported)) {
      report(`[histoire plugin "${pluginId}"] ${contributionId ? `${contributionId} ` : ''}${phase} failed:`, error)
    }
    reported = list.length
  }
  flush()
  return host.subscribe(flush)
}

/**
 * Creates the extension host of one mounted workbench. Returns synchronously: plugin modules
 * load and set up in the background, and outlets show their loading state until `host.ready`.
 * @param options Session, plugins and services.
 */
export function createWorkbenchHost(options: WorkbenchHostOptions): WorkbenchHost {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const navigation = createWorkbenchNavigation({ targets: options.navigation, warn })
  const frames = createFrameChannels({ installed: options.framePlugins ?? (() => sessionFramePlugins(options.session)) })
  const root: RootContext = createRootContext({ session: options.session, mode: options.mode, navigation: navigation.service, devEvents: options.devEvents, tests: options.tests, frames: frames.service })
  const selectedFrame = createSelectedFrameContext(root)
  const host = createExtensionHost({
    plugins: toExtensionHostPlugins(options.plugins),
    services: { context: root.context, storage: options.storage, storageNamespace: options.storageNamespace },
  })
  navigation.attach(host)
  const stopReporting = reportDiagnostics(host, options.error ?? ((message, error) => console.error(message, error)))
  let disposal: Promise<void> | undefined

  /** Root context captured with the scope current at invocation. */
  function rootScope(): ScopedContext {
    return { context: root.context, signal: root.selectionSignal() }
  }

  return {
    host,
    context: root.context,
    selectedFrame,
    frames,
    rootScope,
    frameScope: (frame, session, signal) => createFrameContext(root, { frame, session, signal }),
    frameHeader: createFrameHeaderContexts(root),
    run(contributionId, scope = rootScope()) {
      return host.run(contributionId, scope.context, { signal: scope.signal })
    },
    dispose() {
      if (disposal) return disposal
      // Plugins tear down first while their contexts are still readable.
      disposal = host.dispose().finally(() => {
        stopReporting()
        frames.dispose()
        selectedFrame.close()
        root.close()
      })
      return disposal
    },
  }
}
