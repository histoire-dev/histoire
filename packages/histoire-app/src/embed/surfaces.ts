import type { HistoireBridgeCommand, HistoireBridgePublication, HistoireRuntimeSnapshot, HistoireSourceDescriptor, HistoireSurface } from '@histoire/protocol'
import type { HistoireBridgePort, HistoireRequestCapture, HistoireSession } from '@histoire/sdk/internal'
import { HistoireSdkError } from '@histoire/protocol'
/** Per-document first-party surface context; no global active frame or selection. */
export interface EmbedSurfaceContext {
  /** Explicit first-party local mount; enables compatible runtime-owned preferences. */
  standalone?: boolean
  /** Explicit source base for local standalone mounts whose route changes independently. */
  sourceBase?: string
  /** Native provider renders generic editors locally; independent iframe defaults to full panel. */
  controlsCustomOnly?: boolean
  /** Element owned by this surface document. */
  container: HTMLElement
  /** Parent-backed canonical session proxy. */
  session: HistoireSession
  /** Dedicated transport for runtime publications. */
  bridge: HistoireBridgePort
  /** Portable source appearance/budgets, never executable configuration. */
  descriptor: HistoireSourceDescriptor
  /** Lifetime cancellation. */
  signal: AbortSignal
}
/** Mounted view's explicit runtime dispatch and teardown. */
export interface EmbedSurfaceInstance {
  /** Validated finite parent publication, used by controls overlay results. */
  publication?: (event: HistoireBridgePublication) => void
  /** Primary readiness comes from actual runtime, absent for data-only views. */
  ready: Promise<HistoireRuntimeSnapshot | void>
  /** Finite runtime methods; data views omit dispatcher. */
  request?: (command: HistoireBridgeCommand, payload: unknown, capture: HistoireRequestCapture) => Promise<unknown> | unknown
  /** Resource cleanup before document becomes inactive. */
  close: () => Promise<void> | void
}
/** First-party registrations share one bootstrap; incomplete views remain unavailable. */
const registrations = new Map<HistoireSurface, (context: EmbedSurfaceContext) => EmbedSurfaceInstance>()
/** Register completed surface implementation, returning scoped removal. */
export function registerEmbedSurface(surface: HistoireSurface, mount: (context: EmbedSurfaceContext) => EmbedSurfaceInstance): () => void {
  if (registrations.has(surface)) {
    throw new HistoireSdkError('RUNTIME_IN_USE', `Surface ${surface} already registered`)
  }
  registrations.set(surface, mount)
  return () => {
    if (registrations.get(surface) === mount) {
      registrations.delete(surface)
    }
  }
}
/** Missing implementation fails before empty frame can acknowledge readiness. */
export function assertEmbedSurface(surface: HistoireSurface): void {
  if (!registrations.has(surface)) {
    throw new HistoireSdkError('CAPABILITY_UNAVAILABLE', `Surface ${surface} unavailable`)
  }
}
/** Instantiate only explicit requested registered surface. */
export function mountEmbedSurface(surface: HistoireSurface, context: EmbedSurfaceContext): EmbedSurfaceInstance {
  assertEmbedSurface(surface)
  return registrations.get(surface)!(context)
}
