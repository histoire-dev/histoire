import type { HistoireTarget } from '../types/common.js'
import type { HistoireErrorData } from '../types/error.js'

/** Initial portable descriptor and bridge versions. */
export const HISTOIRE_PROTOCOL_VERSION = 1
export const HISTOIRE_DESCRIPTOR_VERSION = 1

/** Finite request registry; no arbitrary plugin/code/URL execution. */
export const HISTOIRE_BRIDGE_COMMANDS = ['catalog.list', 'catalog.getStory', 'catalog.search', 'selection.select', 'state.get', 'state.patch', 'state.reset', 'settings.update', 'events.clear', 'docs.get', 'source.get', 'tests.collect', 'tests.run', 'tests.cancel', 'openInEditor', 'subscriptions.add', 'subscriptions.remove', 'view.sync', 'controls.configure', 'controls.preset', 'channel.post'] as const

/** Finite publication registry. */
export const HISTOIRE_BRIDGE_EVENTS = ['catalog.changed', 'content.changed', 'selection.changed', 'state.changed', 'settings.changed', 'events.appended', 'readiness.changed', 'layout.changed', 'tests.progress', 'source.disconnected', 'overlay.open', 'overlay.update', 'overlay.close', 'overlay.result', 'controls.height', 'focus.changed', 'channel.message'] as const

/** Validated method intent. */
export type HistoireBridgeCommand = typeof HISTOIRE_BRIDGE_COMMANDS[number]
/** Validated publication. */
export type HistoireBridgeEvent = typeof HISTOIRE_BRIDGE_EVENTS[number]
/** Captured port role controls dispatch authority. */
export type HistoirePortRole = 'data' | 'primary' | 'controls' | 'view'

/** Identity captured at handshake/request dispatch, never inferred from frame load. */
export interface HistoireBridgeIdentity {
  /** Negotiated application protocol. */
  protocolVersion: number
  /** Parent session lifetime. */
  sessionId: string
  /** Negotiated port lifetime. */
  connectionId: string
  /** Attachment lifetime. */
  mountId: string
  /** Stable book identity. */
  sourceId: string
  /** Source generation. */
  epoch: string
  /** Completed source publication. */
  revision: string
  /** Runtime document for targeted traffic. */
  runtimeId?: string
  /** Exact captured target for targeted traffic. */
  target?: HistoireTarget
  /** Parent-owned selection generation; repeated target visits remain distinct. */
  selectionVersion?: number
}

/** Request envelope; payload shape depends on finite command. */
export interface HistoireBridgeRequest extends HistoireBridgeIdentity {
  /** Envelope discriminator. */
  kind: 'request'
  /** Correlation ID scoped to bound port. */
  requestId: string
  /** Finite command discriminator. */
  command: HistoireBridgeCommand
  /** Validated command arguments. */
  payload: unknown
  /** Exact child intent which caused parent view.sync; never part of replies. */
  selectionRequestId?: string
}

/** Correlated reply retains exact captured owner. */
export type HistoireBridgeResponse = HistoireBridgeIdentity & { kind: 'response', requestId: string } & ({ ok: true, result: unknown } | { ok: false, error: HistoireErrorData })

/** Future publication with monotonic sequence per port. */
export interface HistoireBridgePublication extends HistoireBridgeIdentity {
  /** Envelope discriminator. */
  kind: 'event'
  /** Validated event name. */
  event: HistoireBridgeEvent
  /** Monotonic per-port sequence. */
  sequence: number
  /** Validated event payload. */
  payload: unknown
}

/** Only these envelope variants enter dispatch. */
export type HistoireBridgeEnvelope = HistoireBridgeRequest | HistoireBridgeResponse | HistoireBridgePublication

/** Supported protocol range in initial frame handshake. */
export interface HistoireProtocolRange {
  /** Oldest accepted protocol version. */
  min: number
  /** Newest accepted protocol version. */
  max: number
}
