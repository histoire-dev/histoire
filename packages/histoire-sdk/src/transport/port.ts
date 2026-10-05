import type { HistoireBridgeCommand, HistoireBridgeIdentity, HistoireBridgePublication, HistoireBridgeRequest, HistoirePortRole, HistoireSourceDescriptor, HistoireTarget } from '@histoire/protocol'
import type { HistoireRequestCapture, HistoireSessionNotification } from '../adapters/types.js'
import { HistoireSdkError, validateBridgeEnvelope, wireRecord } from '@histoire/protocol'
import { acceptBridgeViewSelection, advanceBridgeSelection, advanceBridgeSourceRevision, createBridgeRuntimeAuthority, createBridgeSelectionEcho, getBridgeIncomingOwner, isBridgeSourcePublication, isBridgeSourceRequest, synchronizeBridgeSelection, validateLocalBridgeSelection } from './authority.js'
import { createInboundBridgeDispatch } from './inbound.js'
import { createBridgeReplies } from './reply.js'
import { createBridgeRequests } from './requests.js'
import { getBridgeRequestTimeout } from './validation.js'
/** Dedicated port options captured once during handshake. */
export interface BridgePortOptions {
  /** Transferred channel endpoint; never shared among mounts. */
  port: MessagePort
  /** Negotiated exact source/session/mount identity. */
  owner: HistoireBridgeIdentity
  /** Authority established by document bootstrap. */
  role: HistoirePortRole
  /** Child endpoint reverses request/publication direction. */
  child?: boolean
  /** Source budgets for execution requests. */
  descriptor?: HistoireSourceDescriptor
  /** Finite inbound method dispatch; replies retain captured request owner. */
  dispatch?: (request: HistoireBridgeRequest, signal: AbortSignal) => Promise<unknown> | unknown
  /** First-party validated publication hook. */
  publication?: (event: HistoireBridgePublication) => void
}
/** One inbound trust gate owns correlation, sequence, sizing, rate and lifecycle. */
export function createBridgePort(options: BridgePortOptions) {
  let owner: HistoireBridgeIdentity = { ...options.owner, selectionVersion: options.owner.selectionVersion ?? 0 }
  /** Direct local snapshot authority supersedes queued source publications. */
  let localRevision: string | undefined
  let active = true
  let sequence = -1
  let outboundSequence = 0
  let rateStart = Date.now()
  let rateCount = 0
  const runtimes = createBridgeRuntimeAuthority()
  const listeners = new Set<(notification: HistoireSessionNotification) => void>()
  const requests = createBridgeRequests()
  const selectionEcho = createBridgeSelectionEcho()
  const inbound = createInboundBridgeDispatch(options.dispatch ? (request, signal) => selectionEcho.dispatch(request, Boolean(options.child), () => options.dispatch!(request, signal)) : undefined)
  const lifetime = new AbortController()
  const direction = options.child ? 'parent-to-child' : 'child-to-parent'
  const outward = options.child ? 'child-to-parent' : 'parent-to-child'
  const emit = (value: HistoireSessionNotification) => {
    if (active) {
      for (const listener of [...listeners]) {
        try {
          listener(value)
        }
        catch {
        }
      }
    }
  }
  const notificationOwner = () => ({ connectionId: owner.connectionId, sourceId: owner.sourceId, epoch: owner.epoch, revision: owner.revision, mountId: owner.mountId, ...(owner.runtimeId ? { runtimeId: owner.runtimeId } : {}) })
  const dropped = (stale = false) => {
    emit({ type: 'dropped', ...notificationOwner(), count: 1, stale })
    if (stale) {
      requests.reject(new HistoireSdkError('STALE_REVISION', 'Required publication dropped'))
    }
  }
  /** Publish only validated portable notifications; runtime transitions may allocate new document IDs. */
  function publish(event: HistoireBridgePublication): void {
    const payload = event.payload as any
    if (event.event === 'catalog.changed') {
      if (localRevision !== undefined && event.revision !== localRevision) return
      owner = advanceBridgeSourceRevision(owner, event.revision, requests)
      emit({ type: 'catalog', ...notificationOwner(), descriptor: payload.descriptor })
    }
    else if (event.event === 'source.disconnected') {
      requests.reject(new HistoireSdkError('NOT_CONNECTED', 'Source disconnected'))
      disconnect()
    }
    else if (event.event === 'readiness.changed') {
      const runtime = payload.runtime
      if (!runtimes.accepts(event, owner)) {
        return
      }
      if (runtimes.retire(event, owner)) {
        requests.reject(new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document changed'), item => Boolean(item.owner.runtimeId) && !item.source && !['selection.select', 'view.sync'].includes(item.command))
      }
      owner = { ...owner, runtimeId: runtime.runtimeId ?? undefined, target: event.target ?? owner.target }
      emit({ type: 'runtime', ...notificationOwner(), runtime })
    }
    else if (event.event === 'state.changed') {
      emit({ type: 'state', ...notificationOwner(), state: payload })
    }
    else if (event.event === 'layout.changed') {
      emit({ type: 'layout', ...notificationOwner(), viewports: payload.viewports })
    }
    else if (event.event === 'events.appended') {
      for (const event of payload.items) {
        emit({ type: 'event', ...notificationOwner(), event })
      }
      if (payload.droppedCount) {
        emit({ type: 'dropped', ...notificationOwner(), count: payload.droppedCount })
      }
    }
    else if (event.event === 'channel.message') {
      emit({ type: 'channel', ...notificationOwner(), message: payload })
    }
    options.publication?.(event)
  }
  const dispatch = createBridgeReplies(options, inbound, () => active, () => ++outboundSequence)
  /** Validate owner before expensive payload traversal or correctly correlated oversize settlement. */
  function receive(message: MessageEvent): void {
    if (!active) {
      return
    }
    let raw: Record<string, any>
    try {
      raw = wireRecord(message.data)
    }
    catch {
      return
    }
    const pending = raw.kind === 'response' && typeof raw.requestId === 'string' ? requests.get(raw.requestId) : undefined
    if (raw.kind === 'response' && !pending) {
      return
    }
    const replacement = options.child && raw.kind === 'request' && ['selection.select', 'view.sync'].includes(raw.command)
    const sourceCancellation = inbound.sourceCancellationOwner(raw)
    // Parent replacement and captured replies may retain predecessor attribution.
    // New work/publications from that predecessor never regain authority.
    if (!pending && !replacement && !sourceCancellation && runtimes.isRetired(raw.runtimeId) && !(raw.kind === 'event' && isBridgeSourcePublication(raw.event)) && !(raw.kind === 'request' && isBridgeSourceRequest(raw.command, raw.payload))) return
    const expected = getBridgeIncomingOwner(owner, raw, Boolean(options.child), pending, sourceCancellation)
    try {
      validateBridgeEnvelope(raw, expected, options.role, pending?.command, direction, true)
      if (raw.kind === 'event') {
        if (Date.now() - rateStart >= 1000) {
          rateStart = Date.now()
          rateCount = 0
        }
        if (++rateCount > 200) {
          dropped(['catalog.changed', 'state.changed', 'layout.changed', 'readiness.changed'].includes(raw.event))
          return
        }
      }
      const envelope = validateBridgeEnvelope(raw, expected, options.role, pending?.command, direction)
      if (envelope.kind === 'response') {
        requests.receive(envelope)
      }
      else if (envelope.kind === 'request') {
        if (!options.dispatch) {
          return
        }
        if (replacement) {
          // Preserve only the exact accepted intent's echo; independent host
          // navigation settles old intent even when its requested target matches.
          owner = envelope.command === 'view.sync' ? acceptBridgeViewSelection(owner, envelope, requests) : advanceBridgeSelection(owner, envelope.target, requests)
        }
        void dispatch(envelope).catch(() => {
        })
      }
      else {
        if (envelope.sequence <= sequence) {
          return
        }
        sequence = envelope.sequence
        publish(envelope)
      }
    }
    catch (error) {
      if (pending) {
        try {
          // Replace body only for identity validation. Wrong-owner messages cannot
          // reject someone else's operation, including oversized forged replies.
          validateBridgeEnvelope({ protocolVersion: raw.protocolVersion, sessionId: raw.sessionId, connectionId: raw.connectionId, mountId: raw.mountId, sourceId: raw.sourceId, epoch: raw.epoch, revision: raw.revision, ...(raw.runtimeId === undefined ? {} : { runtimeId: raw.runtimeId }), ...(raw.target === undefined ? {} : { target: raw.target }), ...(raw.selectionVersion === undefined ? {} : { selectionVersion: raw.selectionVersion }), kind: 'response', requestId: raw.requestId, ok: false, error: { code: 'INVALID_ARGUMENT', message: 'Invalid result' } }, expected, options.role, pending.command, direction)
          pending.settle({ error })
        }
        catch {
        }
      }
      else if (raw.kind === 'event') {
        try {
          validateBridgeEnvelope(raw, expected, options.role, undefined, direction, true)
          dropped(['catalog.changed', 'state.changed', 'layout.changed', 'readiness.changed'].includes(raw.event))
        }
        catch {
        }
      }
    }
  }
  options.port.addEventListener('message', receive)
  options.port.start()
  /** Retire synchronously before closing resources or rejecting pending work. */
  function closePort(): void {
    if (!active) {
      return
    }
    active = false
    lifetime.abort()
    inbound.close()
    requests.reject(new HistoireSdkError('NOT_CONNECTED', 'Port closed'))
    options.port.removeEventListener('message', receive)
    options.port.close()
    listeners.clear()
  }
  /** Data disconnect retires source; surface disconnect retires only its runtime. */
  function disconnect(): void {
    if (options.role === 'data') {
      emit({ type: 'disconnect', ...notificationOwner() })
    }
    else {
      emit({ type: 'runtime', ...notificationOwner(), runtime: { status: 'stale', mountId: owner.mountId, runtimeId: owner.runtimeId ?? null, layout: null, viewports: [], viewport: null } })
    }
    closePort()
  }
  return {
    id: owner.connectionId,
    /** Bound identity for first-party frame synchronization; returned copy has no authority. */
    getOwner: () => ({ ...owner }),
    /** Local host owns both endpoints; canonical revision/selection advance before direct runtime observers. */
    synchronizeSelection(target: HistoireTarget | null, localOwner: HistoireBridgeIdentity, cause?: string): string | undefined {
      if (!active) throw new HistoireSdkError('NOT_CONNECTED', 'Port is closed')
      validateLocalBridgeSelection(owner, localOwner, target)
      localRevision = localOwner.revision
      owner = advanceBridgeSourceRevision(owner, localOwner.revision, requests)
      const selectionRequestId = selectionEcho.requestId ?? cause
      owner = advanceBridgeSelection(owner, target ?? undefined, requests, selectionRequestId)
      return selectionRequestId
    },
    /** Send once with exact captured runtime/source ownership. */
    request<T = unknown>(command: HistoireBridgeCommand, payload: unknown, capture: HistoireRequestCapture): Promise<T> {
      if (!active) {
        return Promise.reject(new HistoireSdkError('NOT_CONNECTED', 'Port is closed'))
      }
      const identity = { ...owner, ...capture, mountId: capture.mountId ?? owner.mountId }
      delete (identity as any).signal
      // Selection owns mount/target, not document it replaces. A view sync may
      // already have rotated runtime before explicit selection dispatch arrives.
      const selecting = !options.child && command === 'selection.select'
      if (runtimes.isRetired(identity.runtimeId) && !isBridgeSourceRequest(command, payload) && !(!options.child && ['selection.select', 'view.sync'].includes(command))) throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document retired')
      if (selecting) {
        delete identity.runtimeId
      }
      const request = { ...identity, kind: 'request' as const, command, requestId: 'validation', payload, ...(!options.child && command === 'view.sync' && selectionEcho.requestId ? { selectionRequestId: selectionEcho.requestId } : {}) }
      validateBridgeEnvelope(request, selecting ? { ...owner, runtimeId: undefined, target: undefined } : owner, options.role, undefined, outward)
      let posted = false
      const pending = requests.add(command, identity, capture.signal, getBridgeRequestTimeout(command, payload, options.descriptor), ['tests.run', 'tests.collect'].includes(command)
        ? (requestId) => {
            if (!active || !posted) return
            const cancellation = requests.add('tests.cancel', identity, lifetime.signal, getBridgeRequestTimeout('tests.cancel', {}, options.descriptor))
            options.port.postMessage({ ...identity, kind: 'request', command: 'tests.cancel', requestId: cancellation.id, payload: { requestId } })
          }
        : undefined, isBridgeSourceRequest(command, payload))
      if (!capture.signal.aborted) {
        try {
          options.port.postMessage({ ...request, requestId: pending.id })
          posted = true
          // Accept host intent before queued child traffic can dispatch. Reply
          // correlation keeps its captured predecessor owner independently.
          if (!options.child && (selecting || command === 'view.sync')) {
            owner = synchronizeBridgeSelection(owner, selecting ? identity.target : (payload as any).selection ?? undefined)
          }
        }
        catch (error) {
          requests.get(pending.id)?.settle({ error })
        }
      }
      return pending.promise as Promise<T>
    },
    /** Publish one validated, monotonically sequenced future event. */
    post(event: HistoireBridgePublication['event'], payload: unknown, runtime: Partial<HistoireBridgeIdentity> = {}) {
      if (!active) {
        return
      }
      const envelope = { ...owner, ...runtime, kind: 'event' as const, event, sequence: ++outboundSequence, payload }
      if (event === 'catalog.changed' && localRevision !== undefined && envelope.revision !== localRevision) return
      if (runtimes.isRetired(envelope.runtimeId) && !isBridgeSourcePublication(event)) return
      validateBridgeEnvelope(envelope, { ...owner, ...runtime }, options.role, undefined, outward)
      options.port.postMessage(envelope)
      if (event === 'catalog.changed') {
        owner = advanceBridgeSourceRevision(owner, envelope.revision, requests)
      }
      if (event === 'readiness.changed') {
        if (runtimes.retire(envelope, owner)) requests.reject(new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document changed'), item => Boolean(item.owner.runtimeId) && !item.source && !['selection.select', 'view.sync'].includes(item.command))
        owner = { ...owner, runtimeId: envelope.runtimeId, target: envelope.target ?? owner.target }
      }
    },
    /** Observe future SDK notifications; no implicit callback. */
    subscribe(listener: (notification: HistoireSessionNotification) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Local frame navigation marks controller stale before endpoint closes. */
    disconnect,
    /** Retire pending operations when frame load or source generation changes. */
    close: closePort,
  }
}
/** First-party endpoint shape reused by view and source documents. */
export type HistoireBridgePort = ReturnType<typeof createBridgePort>
