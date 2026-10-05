/** Hard traversal bounds for all untrusted payloads. */
export const HISTOIRE_WIRE_LIMITS = { metadata: 64 * 1024, request: 1024 * 1024, event: 64 * 1024, catalog: 8 * 1024 * 1024, state: 1024 * 1024, error: 16 * 1024, depth: 128, containers: 100_000, edges: 200_000 } as const

/** Sizing policy selected from validated command and captured role. */
export interface HistoireWirePolicy {
  /** Request, successful result, event, metadata or error representation. */
  kind: 'request' | 'response' | 'event' | 'metadata' | 'error' | 'descriptor'
  /** Validated command or event discriminator. */
  name: string
}

/** Specific limits override generic caps; catalog is never constrained to 1 MiB. */
export function getHistoireWireLimit(policy: HistoireWirePolicy): number {
  if (policy.kind === 'error') return HISTOIRE_WIRE_LIMITS.error
  if (policy.kind === 'metadata') return HISTOIRE_WIRE_LIMITS.metadata
  if (policy.kind === 'descriptor' || policy.name === 'view.sync'
    || (policy.kind === 'response' && ['catalog.list', 'catalog.getStory', 'catalog.search'].includes(policy.name))
    || (policy.kind === 'event' && policy.name === 'catalog.changed')) {
    return HISTOIRE_WIRE_LIMITS.catalog
  }
  if (policy.name === 'channel.message' || policy.name === 'channel.post') return HISTOIRE_WIRE_LIMITS.event
  if (policy.kind === 'event' && ['state.changed', 'layout.changed'].includes(policy.name)) return HISTOIRE_WIRE_LIMITS.state
  return policy.kind === 'event' ? HISTOIRE_WIRE_LIMITS.event : HISTOIRE_WIRE_LIMITS.request
}
