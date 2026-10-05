import type { HistoireBridgeIdentity, HistoireBridgePublication, HistoireBridgeRequest, HistoireRuntimeSnapshot, HistoireTarget } from '@histoire/protocol'
import type { BridgePending, createBridgeRequests } from './requests.js'
import { HistoireSdkError, validateHistoireTarget } from '@histoire/protocol'

/** Selection publishes synchronously; async lifetime must not capture unrelated host intent. */
export function createBridgeSelectionEcho() {
  let requestId: string | undefined
  return {
    /** Exact incoming intent active during synchronous parent-controller publication. */
    get requestId() { return requestId },
    /** Restore nested dispatch scope before any asynchronous work resumes. */
    dispatch<T>(request: HistoireBridgeRequest, child: boolean, operation: () => T): T {
      if (child || request.command !== 'selection.select') return operation()
      const previous = requestId
      requestId = request.requestId
      try {
        return operation()
      }
      finally {
        requestId = previous
      }
    },
  }
}

/** Source lifetime survives story failure, allowing publication-driven replacement. */
export function isBridgeSourcePublication(event: unknown): boolean {
  return ['catalog.changed', 'content.changed', 'source.disconnected'].includes(event as string)
}

/** Source events and authoritative parent snapshots survive missed document transitions. */
export function getBridgeIncomingOwner(owner: HistoireBridgeIdentity, input: Record<string, any>, child: boolean, pending?: BridgePending, cancellation?: HistoireBridgeIdentity): HistoireBridgeIdentity {
  if (pending || cancellation) return pending?.owner ?? cancellation!
  if (input.kind === 'event' && isBridgeSourcePublication(input.event)) return { ...owner, runtimeId: undefined, target: undefined }
  if (child && input.kind === 'request' && input.command === 'view.sync') {
    // A catalog publication may invalidate an earlier parent snapshot after host
    // already advanced its target/generation. Parent snapshot can catch child up;
    // older generations still fail validation and every source/port field stays exact.
    const generation = typeof input.selectionVersion === 'number' && input.selectionVersion >= (owner.selectionVersion ?? 0) ? input.selectionVersion : owner.selectionVersion
    return { ...owner, runtimeId: undefined, target: undefined, selectionVersion: generation }
  }
  const readiness = input.kind === 'event' && input.event === 'readiness.changed'
  const selecting = child && input.kind === 'request' && input.command === 'selection.select'
  return readiness || selecting ? { ...owner, runtimeId: undefined, ...(selecting || (input.runtimeId === undefined && input.target === undefined) ? { target: undefined } : {}) } : owner
}

/** Finite source/presentation work does not execute a retired story document. */
export function isBridgeSourceRequest(command: unknown, payload: unknown): boolean {
  if (['catalog.list', 'catalog.getStory', 'catalog.search', 'docs.get', 'openInEditor', 'settings.update', 'events.clear', 'subscriptions.add', 'subscriptions.remove', 'controls.configure'].includes(command as string)) return true
  const mode = payload && typeof payload === 'object' ? (payload as { mode?: unknown }).mode : undefined
  return (command === 'source.get' && mode === 'raw') || (command === 'tests.run' && mode === 'server')
}

/** Canonical same-epoch revision retires predecessor requests; duplicate delivery preserves current work. */
export function advanceBridgeSourceRevision(owner: HistoireBridgeIdentity, revision: string, requests: ReturnType<typeof createBridgeRequests>): HistoireBridgeIdentity {
  requests.reject(new HistoireSdkError('STALE_REVISION', 'Source publication changed'), item => item.owner.revision !== revision)
  return owner.revision === revision ? owner : { ...owner, revision }
}

/** Advance only accepted parent target transitions; presentation updates keep authority. */
export function synchronizeBridgeSelection(owner: HistoireBridgeIdentity, target: HistoireTarget | undefined): HistoireBridgeIdentity {
  const changed = owner.target?.storyId !== target?.storyId || owner.target?.variantId !== target?.variantId
  return { ...owner, target, selectionVersion: (owner.selectionVersion ?? 0) + Number(changed) }
}

/** Target transitions settle superseded intent while exact accepted echo keeps captured ACK ownership. */
export function advanceBridgeSelection(owner: HistoireBridgeIdentity, target: HistoireTarget | undefined, requests: ReturnType<typeof createBridgeRequests>, selectionRequestId?: string): HistoireBridgeIdentity {
  const next = synchronizeBridgeSelection(owner, target)
  rejectSupersededSelection(owner, next, requests, selectionRequestId)
  return next
}

/** Host snapshot owns its predecessor generation; missing snapshots must not double-increment. */
export function acceptBridgeViewSelection(owner: HistoireBridgeIdentity, request: HistoireBridgeRequest, requests: ReturnType<typeof createBridgeRequests>): HistoireBridgeIdentity {
  const predecessor = request.selectionVersion === undefined ? owner : { ...owner, target: request.target, selectionVersion: request.selectionVersion }
  const next = synchronizeBridgeSelection(predecessor, (request.payload as { selection: HistoireTarget | null }).selection ?? undefined)
  rejectSupersededSelection(owner, next, requests, request.selectionRequestId)
  return next
}

/** Only exact synchronous parent acceptance can retain predecessor child ACK. */
function rejectSupersededSelection(owner: HistoireBridgeIdentity, next: HistoireBridgeIdentity, requests: ReturnType<typeof createBridgeRequests>, selectionRequestId?: string): void {
  // Same-generation runtime/settings echoes leave captured predecessor ACKs pending.
  if (next.selectionVersion !== owner.selectionVersion) requests.reject(new HistoireSdkError('RUNTIME_CHANGED', 'Selection intent superseded'), item => item.command === 'selection.select' && item.owner.selectionVersion !== next.selectionVersion && item.requestId !== selectionRequestId)
}

/** In-process host sync is restricted to the same locally owned session/source/mount. */
export function validateLocalBridgeSelection(owner: HistoireBridgeIdentity, localOwner: HistoireBridgeIdentity, target: HistoireTarget | null): void {
  if (['protocolVersion', 'sessionId', 'connectionId', 'mountId', 'sourceId', 'epoch'].some(key => owner[key as keyof HistoireBridgeIdentity] !== localOwner[key as keyof HistoireBridgeIdentity])) throw new HistoireSdkError('INVALID_ARGUMENT', 'Mismatched local surface authority')
  if (target !== null) validateHistoireTarget(target)
}

/** Dedicated port remembers physical document retirement independently of current selection. */
export function createBridgeRuntimeAuthority() {
  const retired = new Set<string>()
  return {
    /** Retired documents cannot issue new intent or publish late readiness. */
    isRetired: (runtimeId: unknown) => typeof runtimeId === 'string' && retired.has(runtimeId),
    /** Runtime metadata must agree with envelope and exact attachment before adoption. */
    accepts(event: HistoireBridgePublication, owner: HistoireBridgeIdentity): boolean {
      const runtime = (event.payload as { runtime: HistoireRuntimeSnapshot }).runtime
      return runtime.mountId === owner.mountId && (runtime.runtimeId ?? undefined) === event.runtimeId && !(runtime.runtimeId && retired.has(runtime.runtimeId))
    },
    /** Failure retains attribution but permanently removes that ID's document authority. */
    retire(event: HistoireBridgePublication, owner: HistoireBridgeIdentity): boolean {
      const runtime = (event.payload as { runtime: HistoireRuntimeSnapshot }).runtime
      const terminal = ['failed', 'stale', 'absent'].includes(runtime.status)
      const replaced = Boolean(owner.runtimeId && (owner.runtimeId !== runtime.runtimeId || terminal))
      if (replaced) retired.add(owner.runtimeId!)
      if (terminal && runtime.runtimeId) retired.add(runtime.runtimeId)
      return replaced || (terminal && runtime.runtimeId !== null)
    },
  }
}
