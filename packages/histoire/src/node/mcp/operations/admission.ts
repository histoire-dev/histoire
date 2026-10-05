import type { McpOperationInput, McpOperationKind, RequestTombstone } from './types.js'
import { McpDomainError } from '../protocol/errors.js'
import { MCP_LIMITS } from '../protocol/limits.js'

/** Canonical event-loop identity; tuple encoding cannot collide on separators. */
export function requestIdentity(principal: string, epoch: string, requestKey: string) {
  return JSON.stringify([principal, epoch, requestKey])
}

/** Fingerprint parsed defaults while preserving exact IDs and optional constraints. */
export function requestFingerprint(kind: McpOperationKind, input: McpOperationInput) {
  const { requestKey: _key, ...parameters } = input
  if ('globals' in parameters && parameters.globals) {
    parameters.globals = Object.fromEntries(Object.entries(parameters.globals).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
  }
  return JSON.stringify([kind, Object.keys(parameters).filter(key => parameters[key as keyof typeof parameters] !== undefined).sort().map(key => [key, parameters[key as keyof typeof parameters]])])
}

/** Reconcile a lost admission response before validating a new captured target. */
export function reconcileRequest(requests: Map<string, RequestTombstone>, key: string, fingerprint: string) {
  const previous = requests.get(key)
  if (previous && previous.fingerprint !== fingerprint) throw new McpDomainError('REQUEST_KEY_CONFLICT', 'Request key was used with different operation parameters')
  if (!previous && requests.size >= MCP_LIMITS.requestKeys) throw new McpDomainError('QUEUE_FULL', 'Request retry retention is full; wait for expired keys', true)
  return previous
}
