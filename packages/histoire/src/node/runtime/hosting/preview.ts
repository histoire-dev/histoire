import type { Connect } from 'vite'
import type { HistoirePreviewHandle } from '../../api/types.js'
import type { Context } from '../../context.js'
import type { PreviewHostRegistry } from '../browser/preview-host.js'
import type { BuiltPreviewSnapshot } from '../catalog/built.js'
import type { ExecutionService } from '../execution-service.js'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { HistoireSdkError, mergeEmbedFrameAncestors } from '@histoire/protocol'
import connect from 'connect'
import sirv from 'sirv'
import { claimOutput } from '../../api/output-ownership.js'
import { readBuiltEmbedPolicy } from '../../config/embed-built.js'
import { closeContext } from '../../context.js'
import { createNodeHttpHandler } from '../../deploy/http.js'
import { createPreviewHostRegistry } from '../browser/preview-host.js'
import { getBuiltNodeArtifact, readBuiltPreviewSnapshot } from '../catalog/built.js'
import { hasUnconfirmedCleanup } from '../cleanup.js'
import { createExecutionOwner } from '../execution-owner.js'
import { closeOwnedServer, listenOwnedServer } from './listener.js'
import { createEmbedOriginsRoute, createPreviewRoute, matchesHostingBase, unavailableMiddleware } from './routes.js'

/** Private capture source; consumers retain this exact immutable generation at admission. */
export interface PreviewGeneration {
  /** Unique preview lifetime, replaced before restart reads new output. */
  epoch: string
  /** Actual listened origin. */
  origin: string
  /** Actual mounted base, including legacy configuration fallback. */
  base: string
  /** Canonical built target authority. */
  snapshot: BuiltPreviewSnapshot
  /** Shared same-origin nonce host implementation. */
  registry: PreviewHostRegistry
  /** Scoped view of the canonical project lane. */
  execution: ExecutionService
  /** False immediately after restart/close begins. */
  isActive: () => boolean
}

/** Owned built source and its active immutable capture generation. */
export interface PreviewHosting {
  /** Public acquired resource. */
  handle: HistoirePreviewHandle
  /** Captured configured output, protected against owned replacement. */
  outputRoot: string
  /** Current authority, absent while unavailable. */
  readonly current: PreviewGeneration | undefined
}

/** Validates built output and owns only its listener, nonce leases and capture jobs. */
export async function createPreviewHosting(options: {
  /** Fresh preview configuration capture. */
  context: Context
  /** Optional output override used by compatible legacy CLI wrapper. */
  outputRoot?: string
  /** Shared parent lane; this resource owns a scoped cancellation adapter. */
  execution: ExecutionService
  /** Explicit binding hostname. */
  host?: string | boolean
  /** Explicit TCP port; zero chooses an actual ephemeral address. */
  port?: number
  /** CLI compatibility permits trying adjacent occupied ports; SDK defaults strict. */
  strictPort?: boolean
  /** Publishes coherent source changes. */
  onChange: () => void
  /** Releases project slot after confirmed close. */
  onClose: () => void
}): Promise<PreviewHosting> {
  const outputRoot = options.outputRoot ?? options.context.config.outDir
  const release = await claimOutput(outputRoot, 'preview')
  let current: PreviewGeneration | undefined
  let last: BuiltPreviewSnapshot | undefined
  let status: HistoirePreviewHandle['status'] = 'starting'
  let origin = ''
  let base = options.context.resolvedViteConfig.base ?? '/'
  let delegate: Connect.NextHandleFunction = unavailableMiddleware
  let closing: Promise<void> | undefined
  let transition: Promise<void> | undefined
  let retirement: Promise<void> | undefined
  let unsafeCleanupError: unknown
  let allowedOrigins: readonly string[] | undefined
  /** Rechecks terminal state after asynchronous acquisition without narrowing stale state. */
  function handleClosed() {
    return status === 'closed'
  }
  /** Retains unknown resource ownership and prevents every project adapter from reusing its lane. */
  function retainCleanupFailure(error: unknown) {
    unsafeCleanupError ??= error
    options.execution.quarantine()
  }
  const server = createServer((request, response) => {
    if (!matchesHostingBase(request.url, base)) {
      response.statusCode = 404
      response.end('Not found')
      return
    }
    if (allowedOrigins) {
      const existing = response.getHeader('content-security-policy')
      response.setHeader('content-security-policy', mergeEmbedFrameAncestors(typeof existing === 'number' ? String(existing) : existing, allowedOrigins))
    }
    delegate(request, response, () => {
      response.statusCode = 404
      response.end('Not found')
    })
  })
  /** Invalidates leases and retains the retired owner until teardown is confirmed. */
  function retire(): Promise<void> {
    const old = current
    current = undefined
    delegate = unavailableMiddleware
    old?.registry.close()
    if (old) {
      retirement = old.execution.close().catch((error) => {
        // A failed restart must not forget unknown resources when close joins
        // after current has been cleared, even if the runner settles later.
        retainCleanupFailure(error)
        throw error
      })
    }
    return retirement ?? Promise.resolve()
  }
  /** Reads copied output, installs nonce routes, then exposes one ready generation. */
  async function initialize() {
    const snapshot = await readBuiltPreviewSnapshot(outputRoot)
    const embed = await readBuiltEmbedPolicy(snapshot.publicRoot, { target: snapshot.mode, originOverride: snapshot.mode === 'node' ? process.env.HISTOIRE_EMBED_ORIGINS : undefined })
    if (handleClosed()) throw new HistoireSdkError('DISPOSED', 'Histoire preview closed')
    base = snapshot.buildId ? snapshot.base : options.context.resolvedViteConfig.base ?? snapshot.base
    if (!server.listening) origin = await listenOwnedServer(server, options.port ?? 6006, options.host, options.strictPort)
    if (handleClosed()) throw new HistoireSdkError('DISPOSED', 'Histoire preview closed')
    const registry = createPreviewHostRegistry({ base })
    const captured: PreviewGeneration = { epoch: randomUUID(), origin, base, snapshot, registry, execution: createExecutionOwner(options.execution), isActive: () => status !== 'closed' && current === captured }
    const app = connect()
    allowedOrigins = embed?.allowedOrigins
    if (embed && snapshot.mode === 'node') app.use(createEmbedOriginsRoute(base, embed.allowedOrigins))
    app.use(createPreviewRoute(registry))
    const artifact = getBuiltNodeArtifact(snapshot)
    if (artifact) {
      // Node public files retain validated inventory/containment on every read.
      // Transport stays absent; preview owns only its book and capture routes.
      const handler = createNodeHttpHandler({ artifact, host: registry, ready: () => current === captured && status === 'ready', mcp: () => undefined, embedOrigins: embed?.allowedOrigins })
      app.use((request, response) => {
        void handler(request, response).catch(() => response.destroy())
      })
    }
    else {
      app.use(base, sirv(snapshot.publicRoot, { dev: true, etag: true, single: true }))
    }
    current = captured
    last = snapshot
    delegate = app
    status = 'ready'
    options.onChange()
  }
  /** Close is terminal before awaits and still releases all independent resources on failure. */
  function close() {
    if (!closing) {
      status = 'closed'
      const retired = retire()
      closing = (async () => {
        const drained = await Promise.allSettled([retired, transition?.catch(() => {})])
        const released = await Promise.allSettled([closeOwnedServer(server), closeContext(options.context)].map(work => work.catch((error) => {
          // Quarantine at the first unsafe release, while other resources still drain.
          if (hasUnconfirmedCleanup(error)) retainCleanupFailure(error)
          throw error
        })))
        const results = [...drained, ...released]
        if (unsafeCleanupError) throw unsafeCleanupError
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) throw failure.reason
        release()
        options.onClose()
        options.onChange()
      })()
      options.onChange()
    }
    return closing
  }
  try {
    for (const plugin of options.context.config.plugins) await plugin.onPreview?.()
    const ready = initialize()
    transition = ready
    await ready
    transition = undefined
    const handle: HistoirePreviewHandle = {
      get url() {
        return origin ? new URL(base, origin).href : ''
      },
      get status() {
        return status
      },
      get capture() {
        return last?.capture ?? { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
      },
      ready,
      restart() {
        if (status === 'closed') return Promise.reject(new HistoireSdkError('DISPOSED', 'Histoire preview closed'))
        if (unsafeCleanupError) return Promise.reject(unsafeCleanupError)
        if (transition) return transition
        status = 'restarting'
        const retired = retire()
        transition = (async () => {
          await retired
          await initialize()
        })().catch((error) => {
          if (status !== 'closed') {
            status = 'failed'
            options.onChange()
          }
          throw error
        }).finally(() => {
          transition = undefined
        })
        options.onChange()
        return transition
      },
      close,
    }
    return { handle, outputRoot, get current() {
      return current
    } }
  }
  catch (error) {
    if (hasUnconfirmedCleanup(error)) retainCleanupFailure(error)
    try {
      await close()
    }
    catch (cleanupError) {
      if (cleanupError === error) throw error
      throw new AggregateError([error, cleanupError], String(error))
    }
    throw error
  }
}
