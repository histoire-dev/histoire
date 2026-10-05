import type { HistoireMiddlewareHandle } from '../../api/types.js'
import type { RuntimeCatalog } from '../catalog/publication.js'
import type { ExecutionService } from '../execution-service.js'
import type { ProjectRuntimeHandle } from '../types.js'
import type { MiddlewareHostingOptions } from './types.js'
import { HistoireSdkError, mergeEmbedFrameAncestors } from '@histoire/protocol'
import { resolveEmbedConfig } from '../../config/embed.js'
import { attachRuntimeCatalog } from '../catalog/attachment.js'
import { createDevSession } from '../dev-session.js'
import { matchesHostingBase, unavailableMiddleware } from './routes.js'

/** Private dev source handoff for catalog adapters and shared execution consumers. */
export interface DevHosting {
  /** Stable public hosting resource. */
  handle: HistoireMiddlewareHandle
  /** Canonical lifecycle controller. */
  controller: ReturnType<typeof createDevSession>['controller']
  /** Dev source cancellation scope over the canonical project scheduler. */
  readonly execution: ExecutionService
  /** Active canonical completed catalog. */
  readonly catalog: RuntimeCatalog | undefined
}

/** Creates one stable delegate over generation replacement and explicit readiness. */
export function createDevHosting(options: {
  /** Explicit project root. */
  root: string
  /** Root-resolved configuration file. */
  configFile?: string
  /** Stable project identity shared with canonical publication. */
  projectId: string
  /** One parent project lane. */
  execution: ExecutionService
  /** Owned or caller-owned listener integration. */
  middleware: MiddlewareHostingOptions
  /** Observes coherent public state changes. */
  onChange: () => void
  /** Releases project slot only after confirmed cleanup. */
  onClose: () => void
  /** Runs before controller acquisition, e.g. joins caller listening. */
  beforeStart?: (signal: AbortSignal) => Promise<void>
  /** Acquires managed listening before catalog readiness. */
  onGeneration?: (handle: ProjectRuntimeHandle) => Promise<void>
  /** Owned listener teardown; absent for middleware. */
  closeListener?: () => Promise<void>
  /** Current actual origin, populated after managed listening. */
  getOrigin: () => string
}): DevHosting {
  const abort = new AbortController()
  let closed = false
  let closing: Promise<void> | undefined
  let attached: ReturnType<typeof attachRuntimeCatalog> | undefined
  let offCatalog: (() => void) | undefined
  let base = options.middleware.base ?? '/'
  let allowedOrigins: readonly string[] | undefined
  let configuredCsp: string | string[] | number | undefined
  const session = createDevSession({
    root: options.root,
    projectId: options.projectId,
    config: options.configFile,
    middleware: options.middleware,
    execution: options.execution,
    async onGeneration(runtime) {
      base = runtime.server.config.base
      const embed = resolveEmbedConfig(runtime.context.config.embed)
      allowedOrigins = embed.enabled ? embed.allowedOrigins : undefined
      configuredCsp = runtime.server.config.server.headers?.['Content-Security-Policy'] ?? runtime.server.config.server.headers?.['content-security-policy']
      await options.onGeneration?.(runtime)
      const origin = options.getOrigin()
      runtime.server.resolvedUrls = { local: [new URL(base, origin).href], network: [] }
      attached = attachRuntimeCatalog(runtime, { projectId: options.projectId, epoch: runtime.epoch })
      offCatalog = attached.catalog.subscribe(options.onChange)
      options.onChange()
      await attached.ready
    },
    onBeforeRelease() {
      offCatalog?.()
      offCatalog = undefined
      attached?.close()
      attached = undefined
    },
    onError: () => options.onChange(),
  }, process.env.HISTOIRE_MCP_TOKEN)
  const off = session.controller.subscribe(options.onChange)
  const ready = Promise.resolve().then(async () => {
    await options.beforeStart?.(abort.signal)
    if (closed) throw new HistoireSdkError('DISPOSED', 'Histoire hosting closed')
    await session.controller.start()
  })
  void ready.catch(() => {})
  const handle: HistoireMiddlewareHandle = {
    get url() {
      const origin = options.getOrigin()
      return origin ? new URL(base, origin).href : ''
    },
    get status() {
      return session.controller.status
    },
    ready,
    middleware(request, response, next) {
      if (closed || !matchesHostingBase(request.url, base)) return next()
      if (allowedOrigins) {
        const existing = response.getHeader('content-security-policy') ?? configuredCsp
        response.setHeader('content-security-policy', mergeEmbedFrameAncestors(typeof existing === 'number' ? String(existing) : existing, allowedOrigins))
      }
      const runtime = session.controller.current
      if (!runtime?.isActive() || session.controller.status !== 'ready') return unavailableMiddleware(request, response, next)
      const original = request.url
      // Vite internally strips its base; restore the caller's request before
      // host continuation and after a completed response.
      const restore = () => {
        request.url = original
      }
      response.once('finish', restore)
      runtime.server.middlewares(request, response, (error) => {
        response.off('finish', restore)
        restore()
        next(error)
      })
    },
    async restart() {
      if (closed) throw new HistoireSdkError('DISPOSED', 'Histoire hosting closed')
      await ready.catch(() => {})
      await session.controller.restart()
    },
    close() {
      if (!closing) {
        closed = true
        abort.abort(new HistoireSdkError('DISPOSED', 'Histoire hosting closed'))
        closing = (async () => {
          try {
            await session.close()
          }
          finally {
            off()
            await options.closeListener?.()
          }
          await ready.catch(() => {})
          options.onClose()
          options.onChange()
        })()
      }
      return closing
    },
  }
  return { handle, controller: session.controller, execution: session.execution, get catalog() {
    return attached?.catalog
  } }
}
