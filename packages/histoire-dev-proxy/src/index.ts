import type { watchConfiguration } from './config/watcher.js'
import type { PublicState, RestartCause, RestartRequest, RuntimeCommand, RuntimeEvent, RuntimeOutput, RuntimeReply, RuntimeSendResult, RuntimeStatus, WatchInput } from './protocol.js'
import type { ProxyRequestObserver } from './server/observe.js'
import { randomUUID } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { inspect } from 'node:util'
import { createRestartCoordinator } from './lifecycle/index.js'
import { startRuntimeChild } from './process/child.js'
import { createProxyHttp } from './server/http.js'
import { listen } from './server/listener.js'

export type { ProxyRequestEvent, ProxyRequestObserver, ProxyRequestOutcome } from './server/observe.js'

/** Lightweight parent inputs; runtime executable remains an external adapter. */
export interface DevProxyOptions {
  /** Project working directory. */
  root?: string
  /** Explicit config path relative to root. */
  config?: string
  /** Public port; zero asks OS for an ephemeral port. */
  port?: number
  /** Public interface, default localhost. */
  host?: string | boolean
  /** Open public URL once listener binds. */
  open?: boolean
  /** Framework runtime executable owned by proxy. */
  runtime: URL
  /** Serializable runtime-specific CLI options. */
  runtimeOptions?: Record<string, unknown>
  /** Captured credential, never inherited by project config through env. */
  token?: string
  /** Graceful child winddown budget; default 10000ms. */
  shutdownTimeout?: number
  /** Observe public listener before project work begins. */
  onListening?: (url: string) => void
  /** Optional terminal/application observation; receives detached browser-safe state. */
  onStatus?: (state: Readonly<PublicState>) => void
  /** Takes over runtime stdout/stderr (each chunk delivered once); without it the streams are piped unchanged. */
  onOutput?: (output: RuntimeOutput) => void
  /** Receives reply/event frames from the current runtime generation. */
  onRuntimeMessage?: (message: RuntimeReply | RuntimeEvent) => void
  /** A runtime generation can no longer answer: winddown began or the process exited. */
  onRuntimeRetired?: (generation: string) => void
  /** Called once per restart transition, as it begins, with its merged cause. Never called for the first start. */
  onRestart?: (cause: RestartCause) => void
  /** Called when a runtime generation is spawned; `fresh` generations bypass cached catalog and dependency reuse. */
  onRuntimeStart?: (info: { generation: string, fresh: boolean }) => void
  /**
   * Observes public HTTP exchanges (forwarded and proxy-answered startup responses, not the proxy's own
   * status stream and assets, not WebSocket upgrades). Without it nothing is allocated or listened to.
   */
  onRequest?: ProxyRequestObserver
  /** Receives proxy diagnostics; without it they go to `console.error`. */
  onDiagnostic?: (message: string) => void
}

/** Bind first; child startup and project imports happen after handle is available. */
export async function startDevProxy(options: DevProxyOptions) {
  const root = resolve(options.root ?? process.cwd())
  let state: PublicState = { status: 'starting', generation: randomUUID(), base: '/' }
  const http = createProxyHttp(() => state, () => restart({ cause: 'browser' }), options.onRequest)
  let url: string
  try {
    url = `${await listen(http.server, options.port ?? 6006, options.host)}/`
  }
  catch (error) {
    await http.close()
    throw error
  }
  /** Proxy notices reach the observer when present, otherwise the console. */
  function diagnostic(error: unknown) {
    const text = typeof error === 'string' ? error : inspect(error)
    if (!options.onDiagnostic) {
      console.error(error)
      return
    }
    try {
      options.onDiagnostic(text)
    }
    catch {}
  }
  let active: ReturnType<typeof startRuntimeChild> | undefined
  let watcher: Awaited<ReturnType<typeof watchConfiguration>> | undefined
  let closed = false
  let opened = false
  let closing: Promise<void> | undefined
  /** Causes the next announced restart transition will carry, merged. */
  let requested: RestartCause | undefined
  /**
   * An announced transition is still tearing down the previous generation. Requests landing now are
   * coalesced into it (the coordinator acquires after teardown), so they must not name a later transition.
   */
  let releasing = false
  /** A fresh generation is owed; consumed by the next spawn and re-armed if that one is abandoned before ready. */
  let freshPending = false
  /** Records a restart request before the coordinator can publish `restarting`. */
  function record(request: RestartRequest) {
    const fresh = request.fresh === true
    if (fresh) freshPending = true
    // Served by the transition already announced: its acquisition consumes `freshPending`.
    if (releasing) return
    // First cause names the transition; a coalesced fresh request upgrades it without replacing the label.
    requested = requested ? { ...requested, fresh: requested.fresh || fresh } : { kind: request.cause ?? 'manual', ...(request.source ? { source: request.source } : {}), fresh }
  }
  /** Delivers the merged cause exactly once for the transition that just began. */
  function announceRestart() {
    const cause = requested
    requested = undefined
    releasing = true
    if (!cause || !options.onRestart) return
    try {
      options.onRestart(cause)
    }
    catch {}
  }
  /** Central publication always withdraws unavailable targets first. */
  function publish(status: RuntimeStatus, error?: unknown) {
    if (status !== 'ready') http.setTarget()
    let detail = error === undefined ? undefined : String(error instanceof Error ? error.message : error).split('\n')[0].slice(0, 512)
    if (detail && options.token) detail = detail.replaceAll(options.token, '[credential]')
    state = { ...state, status, ...(detail ? { error: detail } : {}) }
    if (!detail) delete state.error
    http.events.publish()
    options.onStatus?.({ ...state })
  }
  /** Browser opener loads only after initial public listener exists. */
  async function open(path = '/') {
    if (opened || closed) return
    opened = true
    const { default: openBrowser } = await import('open')
    if (!closed) await openBrowser(new URL(path, url).href)
  }
  const controller = createRestartCoordinator({
    interruptStartup: true,
    acquire: async (_signal, isActive) => {
      state = { ...state, generation: randomUUID() }
      http.events.publish()
      let completeInputs: WatchInput[] | undefined
      const generation = state.generation
      // Teardown is over: requests from here on schedule another transition, which owns their cause.
      releasing = false
      const fresh = freshPending
      freshPending = false
      options.onRuntimeStart?.({ generation, fresh })
      const child = startRuntimeChild({
        entry: options.runtime,
        root,
        generation: state.generation,
        publicOrigin: new URL(url).origin,
        options: fresh ? { ...options.runtimeOptions, fresh: true } : options.runtimeOptions ?? {},
        token: options.token,
        shutdownTimeout: options.shutdownTimeout,
        onOutput: options.onOutput,
        onRuntimeMessage: options.onRuntimeMessage,
        onRetire: options.onRuntimeRetired && (() => options.onRuntimeRetired!(generation)),
        onDiagnostic: options.onDiagnostic && (message => diagnostic(message)),
        onWatch: async (inputs, complete) => {
          if (complete) completeInputs = inputs
          await watcher?.update(inputs, isActive)
        },
        onReady: async () => {
          if (completeInputs) await watcher?.replace(completeInputs, isActive)
        },
        onRestartRequest: ({ source, fresh }) => {
          // A retired generation can't schedule the successor of its replacement.
          if (closed || !isActive()) return
          record({ cause: 'runtime', source, fresh })
          void controller.restart().catch(error => publish('failed', error))
        },
        onExit: (error) => {
          if (closed || !isActive()) return
          // Coordinator still owns crashed child as ready; replace it instead of serving dead handle.
          diagnostic(error.message)
          publish('failed', error)
          record({ cause: 'exit', source: error.message })
          void controller.restart().catch(failure => publish('failed', failure))
        },
      })
      // A fresh generation superseded before readiness never delivered its fresh work: owe it again.
      const close = child.close
      child.close = () => {
        if (fresh && !child.backend) freshPending = true
        return close()
      }
      return child
    },
    isUnsafeCleanup: () => false,
    quarantineCleanupFailures: false,
    withDeadline: promise => promise,
  })
  const off = controller.subscribe((status, runtime) => {
    if (closed) return
    active = status === 'ready' ? runtime : undefined
    if (status === 'restarting') {
      announceRestart()
    }
    else if (status === 'ready' || status === 'failed') {
      releasing = false
      // Only a terminal failure strands recorded causes: no further transition will announce them.
      // After `ready`, causes recorded during acquisition belong to the transition that follows.
      if (status === 'failed') requested = undefined
    }
    if (status === 'ready' && runtime?.backend) {
      state = { ...state, base: runtime.backend.base }
      http.setTarget(runtime.backend.target)
      if (runtime.backend.open) void open(typeof runtime.backend.open === 'string' ? runtime.backend.open : runtime.backend.base).catch(diagnostic)
    }
    publish(status)
  })
  const prepared = (async () => {
    options.onListening?.(url)
    if (options.open) void open().catch(diagnostic)
    const config = await import('./config/index.js')
    if (closed) return
    watcher = await config.watchConfiguration([], (source, file) => {
      if (closed) return
      // Label with the origin kind and the project-relative file, so the notice names what changed.
      record({ cause: 'config', source: `${source}: ${relative(root, file).replaceAll('\\', '/')}` })
      void controller.restart().catch(error => publish('failed', error))
    })
    if (closed) {
      await watcher.close()
      return
    }
    try {
      const revision = await config.captureProjectConfigurationRevision(root, options.config)
      await watcher.update(await config.configurationWatchInputs({ root, config: options.config, revision }))
    }
    catch (error) {
      // Runtime still reports its own inputs; an unreadable candidate must not disable watching.
      diagnostic(error)
    }
    if (closed) return
    await http.prepare()
  })()
  const boot = prepared.then(async () => {
    if (!closed) await controller.start()
  })
  const ready = boot.catch((error) => {
    if (!closed) publish('failed', error)
    throw error
  })
  void ready.catch(() => {
  })
  /** Manual replacement uses same serialized winddown as configuration changes. */
  async function restart(request: RestartRequest = {}) {
    if (closed) throw new Error('Histoire proxy closed')
    await prepared
    record(request)
    await controller.restart().catch((error) => {
      publish('failed', error)
      throw error
    })
  }
  return {
    /** Actual public address, including OS-selected or fallback port. */
    url,
    /** Initial runtime acquisition; watcher remains live after rejection. */
    ready,
    /** Latest public availability, independent of any runtime process. */
    get status() {
      return state.status
    },
    restart,
    /** Opens an absolute URL in the default browser on demand (terminal action); unrelated to the one-shot `open` option. */
    async openBrowser(target: string) {
      if (closed) return
      const { default: openBrowser } = await import('open')
      await openBrowser(target)
    },
    /** Delivers a command to the current ready runtime; never queues for an unknown successor. */
    async sendRuntimeCommand(command: Omit<RuntimeCommand, 'type' | 'generation'>): Promise<RuntimeSendResult> {
      if (closed) return { ok: false, reason: 'closed' }
      if (state.status !== 'ready' || !active) return { ok: false, reason: state.status === 'ready' || state.status === 'closed' ? 'closed' : state.status }
      return active.sendRuntimeCommand(command)
    },
    /** Stop observation/admission synchronously before joining child shutdown. */
    close() {
      return closing ??= (async () => {
        closed = true
        publish('closed')
        const stop = controller.close()
        await Promise.allSettled([boot])
        try {
          await stop
        }
        finally {
          off()
          await watcher?.close()
          await http.close()
        }
      })()
    },
  }
}
