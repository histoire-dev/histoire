import type { ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import type { ExecutionService } from '../runtime/execution-service.js'
import { randomUUID } from 'node:crypto'
import { getRuntimeCatalogForContext } from '../runtime/catalog/attachment.js'
import { getContextScreenshotSetup } from '../runtime/registry.js'
import { getDevPreviewHost } from '../vite/mcp-preview-html.js'
import { resolveVisualConfig } from './config.js'

const revisions = new WeakMap<ViteDevServer, number>()
const listeners = new WeakMap<ViteDevServer, Set<() => void>>()

/** Retire captures for every dependency HMR, even when catalog metadata is identical. */
export function retireVisualSource(server: ViteDevServer): void {
  revisions.set(server, (revisions.get(server) ?? 0) + 1)
  for (const listener of listeners.get(server) ?? []) listener()
}

/** Observe render retirement through existing server ownership. */
export function onVisualSourceRetired(server: ViteDevServer, listener: () => void): () => void {
  const set = listeners.get(server) ?? new Set<() => void>()
  listeners.set(server, set)
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

/** Ready generation and completed catalog captured before asynchronous work. */
export interface VisualSource {
  /** Exact server-side configuration and story inventory. */
  ctx: Context
  /** Existing dev HTTP source. */
  server: ViteDevServer
  /** Existing source-owned execution lane. */
  execution: ExecutionService
  /** Preview host generation token. */
  epoch: string
  /** Current generation and completed publication remain authoritative. */
  isActive: () => boolean
}

/** Bind one ready completed catalog revision; no second collector or launcher. */
export function resolveVisualSource(ctx: Context, server: ViteDevServer, execution: ExecutionService, active: () => boolean, epoch: string = randomUUID()): VisualSource {
  const catalog = getRuntimeCatalogForContext(ctx)?.catalog
  const snapshot = catalog?.current
  const renderRevision = revisions.get(server) ?? 0
  const executionRevision = catalog?.executionRevision
  if (!active() || !snapshot || catalog.updating || !resolveVisualConfig(ctx.config.visual)) {
    throw new Error('Visual testing requires enabled configuration and a ready development source')
  }
  return { ctx, server, execution, epoch, isActive: () => active() && (revisions.get(server) ?? 0) === renderRevision && catalog.executionRevision === executionRevision && catalog.current === snapshot && !catalog.updating }
}

/** Exact private render input, independent of workbench preferences. */
export function visualSession(source: VisualSource, storyId: string, variantId: string, spec: import('@histoire/shared').HistoireVisualCaptureSpec) {
  const address = source.server.resolvedUrls?.local[0]
  if (!address || !source.isActive()) {
    throw new Error('Visual source changed')
  }
  return { root: source.ctx.root, host: getDevPreviewHost(source.server), setupOwner: getContextScreenshotSetup(source.ctx), stableCapture: true, target: { origin: new URL(address).origin, epoch: source.epoch, storyId, variantId, ...spec, isActive: source.isActive } }
}
